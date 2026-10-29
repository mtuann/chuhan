/**
 * Điều phối animation nét cho cả câu (trang Xem cách viết), không phụ thuộc Hanzi Writer để test được:
 * - `sequence` (Lần lượt): viết hết chữ này mới sang chữ sau, từ trái qua phải; xong câu thì nghỉ rồi chạy lại.
 * - `together` (Đồng loạt): mọi chữ cùng chạy, mỗi chữ một vòng riêng: viết xong thì nghỉ một chút rồi quay lại nét đầu.
 * Dừng/chạy tiếp áp dụng cho mọi chữ; ở kiểu Đồng loạt, chữ nằm ngoài màn hình tự tạm dừng.
 */

/** Một ô chữ đã sẵn sàng (Hanzi Writer đã tải xong dữ liệu nét). */
export interface CharAnim {
  /** viết lại từ nét đầu; xong (hoặc bị huỷ vì có lệnh mới) thì resolve */
  animate(): Promise<void>;
  /** ẩn chữ (còn nét mờ nếu đang bật) */
  hide(): void;
  /** hiện đủ chữ */
  show(): void;
  pause(): void;
  resume(): void;
}

export type RunMode = 'sequence' | 'together';
export type CharState = 'cho' | 'dang-viet' | 'xong';

export interface RunnerHooks {
  /** trạng thái một ô: chờ, đang viết, đã viết xong */
  onState?(i: number, s: CharState): void;
  /** ô đang viết ở kiểu Lần lượt (-1: không có) */
  onActive?(i: number): void;
  /** số vòng đã viết xong của một ô (kiểu Đồng loạt) */
  onLoop?(i: number, n: number): void;
  /** đã viết hết câu (kiểu Lần lượt, không lặp) */
  onEnd?(): void;
}

export interface RunnerTiming {
  /** nghỉ giữa hai chữ (Lần lượt) */
  charGap: number;
  /** nghỉ khi xong cả câu trước khi chạy lại (Lần lượt) */
  endPause: number;
  /** nghỉ khi một chữ viết xong trước khi quay lại nét đầu (Đồng loạt) */
  loopPause: number;
}

export const DEFAULT_TIMING: RunnerTiming = { charGap: 350, endPause: 1600, loopPause: 700 };

const TICK = 50;

export class StrokeRunner {
  private anims: (CharAnim | null | undefined)[];
  private waiting = new Map<number, (() => void)[]>();
  private token = 0;
  /** token riêng của từng chữ (Đồng loạt: chạm vào một chữ thì chỉ chữ đó chạy lại) */
  private charToken: number[];
  private hidden = new Set<number>();
  private running = new Set<number>();
  private _paused = false;
  private _mode: RunMode = 'sequence';
  private _active = -1;
  loop = true;

  constructor(
    n: number,
    private hooks: RunnerHooks = {},
    private timing: RunnerTiming = DEFAULT_TIMING,
  ) {
    this.anims = Array.from({ length: n }, () => undefined);
    this.charToken = Array.from({ length: n }, () => 0);
  }

  get size() {
    return this.anims.length;
  }
  get paused() {
    return this._paused;
  }
  get mode() {
    return this._mode;
  }
  get active() {
    return this._active;
  }

  /** Ô `i` đã tải xong (`null`: không có dữ liệu nét, bỏ qua). */
  set(i: number, anim: CharAnim | null) {
    this.anims[i] = anim;
    if (anim && this._mode === 'sequence') {
      if (this._active >= 0 && i < this._active) anim.show();
      else anim.hide();
    }
    for (const f of this.waiting.get(i) ?? []) f();
    this.waiting.delete(i);
  }

  /** Ô ra/vào màn hình: kiểu Đồng loạt chỉ chạy các ô đang thấy. */
  setVisible(i: number, visible: boolean) {
    if (visible) this.hidden.delete(i);
    else this.hidden.add(i);
    if (this._mode !== 'together' || !this.running.has(i)) return;
    const a = this.anims[i];
    if (!a) return;
    if (!visible) a.pause();
    else if (!this._paused) a.resume();
  }

  pause() {
    if (this._paused) return;
    this._paused = true;
    for (const i of this.running) this.anims[i]?.pause();
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    for (const i of this.running) if (this._mode === 'sequence' || !this.hidden.has(i)) this.anims[i]?.resume();
  }

  /** Dừng hẳn (đổi câu, rời trang). */
  stop() {
    this.token++;
    this.wakeAll();
    this.unpauseRunning();
    this.running.clear();
  }

  /** Bắt đầu theo kiểu `mode`; `from`: chữ bắt đầu (Lần lượt). Luôn chạy (bỏ trạng thái dừng). */
  play(mode: RunMode, from = 0) {
    this.stop();
    this._paused = false;
    this._mode = mode;
    if (mode === 'sequence') void this.sequence(from, this.token);
    else {
      this.setActive(-1);
      for (let i = 0; i < this.anims.length; i++) void this.loopOne(i, this.token, ++this.charToken[i]);
    }
  }

  /** Chạm vào một chữ: Lần lượt → chạy lại từ chữ đó; Đồng loạt → chỉ chữ đó viết lại từ nét đầu. */
  restartFrom(i: number) {
    if (this._mode === 'sequence') {
      this.play('sequence', i);
      return;
    }
    if (this._paused) this.resume();
    void this.loopOne(i, this.token, ++this.charToken[i]);
  }

  // ------------------------------------------------------------ bên trong

  private setActive(i: number) {
    this._active = i;
    this.hooks.onActive?.(i);
  }

  private state(i: number, s: CharState) {
    this.hooks.onState?.(i, s);
  }

  private unpauseRunning() {
    for (const i of this.running) this.anims[i]?.resume();
  }

  private wakeAll() {
    for (const fs of this.waiting.values()) for (const f of fs) f();
    this.waiting.clear();
  }

  private ready(i: number): Promise<CharAnim | null> {
    const a = this.anims[i];
    if (a !== undefined) return Promise.resolve(a);
    return new Promise((resolve) => {
      const list = this.waiting.get(i) ?? [];
      list.push(() => resolve(this.anims[i] ?? null));
      this.waiting.set(i, list);
    });
  }

  private runnable(i: number) {
    return !this._paused && (this._mode === 'sequence' || !this.hidden.has(i));
  }

  /** Chờ `ms` mili giây tính theo thời gian được chạy (đang dừng thì không tính). false: đã có lệnh mới. */
  private async wait(ms: number, alive: () => boolean, i = -1): Promise<boolean> {
    let left = ms;
    while (left > 0) {
      await new Promise((r) => setTimeout(r, TICK));
      if (!alive()) return false;
      if (this.runnable(i)) left -= TICK;
    }
    return alive();
  }

  private async untilRunnable(alive: () => boolean, i: number): Promise<boolean> {
    while (!this.runnable(i)) {
      await new Promise((r) => setTimeout(r, TICK));
      if (!alive()) return false;
    }
    return alive();
  }

  private async sequence(from: number, t: number) {
    const alive = () => t === this.token;
    for (let i = 0; i < this.anims.length; i++) {
      const a = this.anims[i];
      if (i < from) {
        a?.show();
        this.state(i, 'xong');
      } else {
        a?.hide();
        this.state(i, 'cho');
      }
    }
    for (let i = from; i < this.anims.length; i++) {
      this.setActive(i);
      const a = await this.ready(i);
      if (!alive()) return;
      if (!a) {
        this.state(i, 'xong');
        continue;
      }
      if (!(await this.untilRunnable(alive, i))) return;
      this.state(i, 'dang-viet');
      this.running.add(i);
      await a.animate();
      this.running.delete(i);
      if (!alive()) return;
      this.state(i, 'xong');
      if (i < this.anims.length - 1 && !(await this.wait(this.timing.charGap, alive))) return;
    }
    if (!this.loop) {
      this.setActive(-1);
      this.hooks.onEnd?.();
      return;
    }
    if (!(await this.wait(this.timing.endPause, alive))) return;
    void this.sequence(0, t);
  }

  private async loopOne(i: number, t: number, ct: number) {
    const alive = () => t === this.token && ct === this.charToken[i];
    const a = await this.ready(i);
    if (!a || !alive()) return;
    let n = 0;
    for (;;) {
      if (!(await this.untilRunnable(alive, i))) return;
      this.state(i, 'dang-viet');
      this.running.add(i);
      await a.animate();
      if (!alive()) return;
      this.running.delete(i);
      this.state(i, 'xong');
      this.hooks.onLoop?.(i, ++n);
      if (!(await this.wait(this.timing.loopPause, alive, i))) return;
    }
  }
}
