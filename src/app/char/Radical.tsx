/**
 * Bộ thủ của một chữ: dạng bộ (Make Me a Hanzi), số bộ Khang Hy (Unicode), tên gọi theo âm Hán Việt của chữ bộ
 * (bảng Hán Việt), tên gọi khác có nguồn. Không tự đặt tên bộ (spec 00 mục 6).
 */
import { useEffect, useState } from 'react';
import type { CharRec, RadicalRec, RadicalsPack } from '../../schema/data';
import { loadRadicals } from '../../lib/data';
import { url } from '../../lib/url';
import { Han } from '../ui';

export function useRadicals(): RadicalsPack | null {
  const [pack, setPack] = useState<RadicalsPack | null>(null);
  useEffect(() => {
    loadRadicals()
      .then(setPack)
      .catch(() => undefined);
  }, []);
  return pack;
}

/**
 * Bộ Khang Hy của chữ. 阝 bên phải (都, 那) là bộ 邑 (số 163), bên trái (陈, 院) là bộ 阜 (số 170): danh sách chữ có
 * 阝 bên phải do pipeline tính từ cấu tạo chữ.
 */
export function radicalOf(rec: Pick<CharRec, 'c' | 'rad'>, pack: RadicalsPack): RadicalRec | undefined {
  if (!rec.rad) return undefined;
  const n = rec.rad === '阝' && pack.cityRight.includes(rec.c) ? 163 : pack.forms[rec.rad];
  return n ? pack.radicals[n - 1] : undefined;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** "bộ Thuỷ" theo âm Hán Việt đầu tiên của chữ bộ; không có âm thì "bộ số 71". */
export const radicalName = (r: RadicalRec) => (r.hv?.length ? `bộ ${cap(r.hv[0])}` : `bộ số ${r.n}`);

/** Dòng "Bộ" trên trang chữ: 氵 · bộ Thuỷ (số 85, 水) · còn gọi: ba chấm thuỷ. */
export function RadicalLine({ c, rec }: { c: string; rec: Pick<CharRec, 'c' | 'rad'> }) {
  const pack = useRadicals();
  if (!rec.rad) return null;
  const r = pack ? radicalOf(rec, pack) : undefined;
  const form = rec.rad;
  const aka = r?.aka?.filter(([f]) => f === form || f === r.c).map(([, name]) => name) ?? [];
  return (
    <span className="inline">
      {form === c ? (
        <Han className="text-lg">{form}</Han>
      ) : (
        <a className="underline decoration-line underline-offset-4" href={url(`chu/?c=${encodeURIComponent(form)}`)}>
          <Han className="text-lg">{form}</Han>
        </a>
      )}
      {r && (
        <>
          {' · '}
          <a className="underline decoration-line underline-offset-4" href={url(`bo-thu/#bo-${r.n}`)}>
            {radicalName(r)}
          </a>{' '}
          <span className="text-muted">
            (số {r.n}
            {r.c !== form && (
              <>
                , <Han>{r.c}</Han>
              </>
            )}
            )
          </span>
          {aka.length > 0 && <span className="text-muted"> · còn gọi: {aka.join(', ')}</span>}
        </>
      )}
    </span>
  );
}
