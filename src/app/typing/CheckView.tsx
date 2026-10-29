/**
 * Kết quả chấm một lượt gõ: từng chữ đúng/sai (chọn nhầm chữ cùng âm, gõ sai âm, sai dấu câu, thiếu, thừa) và lời
 * giải thích có âm Hán Việt, nghĩa của chữ đúng và chữ đã chọn, mẹo theo lỗi hay gặp của người Việt (kể cả dùng ， khi
 * liệt kê thay cho 、).
 */
import type { ImeLexicon } from '../../lib/ime';
import { isZhPunct, punctInfo, punctShown, punctTip, type Cell, type CheckResult } from '../../lib/typing';
import { Han } from '../ui';
import { PunctGuide } from './PunctGuide';

/** Âm Hán Việt và nghĩa của một chữ: "tại: ở; tại". */
export function charInfo(lex: ImeLexicon | null, c: string): string {
  const e = lex?.charInfo.get(c);
  if (!e) return '';
  return [e.hv, e.m || (e.of ? `trong ${e.of}` : '')].filter(Boolean).join(': ');
}

const CELL_CLASS: Record<Cell['kind'], string> = {
  ok: '',
  'dong-am': 'rounded bg-t1/10 px-0.5 text-t1',
  'sai-am': 'rounded bg-t1/10 px-0.5 text-t1',
  'dau-cau': 'rounded bg-t1/10 px-0.5 text-t1',
  thieu: 'rounded border-2 border-dashed border-t1 px-0.5 text-t1/70',
  thua: 'text-t1 line-through decoration-2',
};

/** Ô là lỗi dấu câu (sai dấu, thiếu dấu, thừa dấu). */
export const isPunctCell = (c: Cell) => c.kind === 'dau-cau' || (c.kind === 'thieu' && !!c.t && isZhPunct(c.t)) || (c.kind === 'thua' && !!c.got && isZhPunct(c.got));

/** Hàng chữ: chữ đúng như thường, chữ sai tô đỏ, chữ đã gõ nhầm hiện nhỏ bên dưới. */
export function CellsRow({ res }: { res: CheckResult }) {
  return (
    <p className="flex flex-wrap items-start gap-x-1 gap-y-2" aria-label="Kết quả từng chữ">
      {res.cells.map((c, i) => (
        <span key={i} className="inline-flex flex-col items-center">
          <Han className={`text-3xl ${CELL_CLASS[c.kind]}`}>{c.kind === 'thua' ? c.got : c.t}</Han>
          <span className="mt-0.5 min-h-4 text-[11px] leading-tight whitespace-nowrap text-t1">
            {c.kind === 'dong-am' || c.kind === 'sai-am' || c.kind === 'dau-cau' ? (
              <>
                gõ <Han>{c.got}</Han>
              </>
            ) : c.kind === 'thieu' ? (
              c.t && isZhPunct(c.t) ? (
                'thiếu dấu'
              ) : (
                'thiếu'
              )
            ) : c.kind === 'thua' ? (
              'thừa'
            ) : (
              ''
            )}
          </span>
        </span>
      ))}
    </p>
  );
}

/** Giải thích từng lỗi (mỗi kiểu lỗi của một chữ một dòng). */
export function Explain({ res, lex }: { res: CheckResult; lex: ImeLexicon | null }) {
  const seen = new Set<string>();
  const rows = res.cells.filter((c) => {
    if (c.kind === 'ok') return false;
    const k = `${c.kind}${c.t}${c.got}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!rows.length) return null;
  const anyPunct = rows.some(isPunctCell);
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((c, i) => (
        <li key={i} className="rounded-lg bg-paper px-3 py-2">
          {isPunctCell(c) ? (
            <>
              <b>{c.kind === 'dau-cau' ? 'Sai dấu câu.' : c.kind === 'thieu' ? 'Thiếu dấu câu.' : 'Thừa dấu câu.'}</b>{' '}
              {punctTip(c.kind === 'thua' ? undefined : c.t, c.kind === 'thieu' ? undefined : c.got)}
            </>
          ) : (
            <>
              {c.kind === 'dong-am' && (
                <>
                  <b>Chọn nhầm chữ cùng âm.</b> Cần <Han className="text-lg">{c.t}</Han> {charInfo(lex, c.t!) && <span>({charInfo(lex, c.t!)})</span>}, bạn
                  chọn <Han className="text-lg">{c.got}</Han> {charInfo(lex, c.got!) && <span>({charInfo(lex, c.got!)})</span>}. Cùng gõ{' '}
                  <span className="font-mono">{c.syl}</span>: nhớ âm Hán Việt và nghĩa để chọn đúng chữ.
                </>
              )}
              {c.kind === 'sai-am' && (
                <>
                  <b>Gõ sai âm.</b> <Han className="text-lg">{c.t}</Han> gõ là <span className="font-mono font-semibold">{c.syl || '?'}</span>
                  {c.gotSyl ? (
                    <>
                      , bạn gõ <span className="font-mono">{c.gotSyl}</span> (<Han>{c.got}</Han>)
                    </>
                  ) : (
                    <>
                      , bạn gõ <Han>{c.got}</Han>
                    </>
                  )}
                  . {c.hint && c.hint.key !== 'âm khác' && <span className="text-muted">Mẹo: {c.hint.tip}.</span>}
                </>
              )}
              {c.kind === 'thieu' && (
                <>
                  <b>Thiếu chữ</b> <Han className="text-lg">{c.t}</Han> (gõ <span className="font-mono">{c.syl}</span>).
                </>
              )}
              {c.kind === 'thua' && (
                <>
                  <b>Thừa chữ</b> <Han className="text-lg">{c.got}</Han>.
                </>
              )}
            </>
          )}
        </li>
      ))}
      {anyPunct && (
        <li>
          <PunctGuide inline />
        </li>
      )}
    </ul>
  );
}

/** Một lỗi dấu câu trong danh sách lỗi (cần dấu `t`, gõ `got`; trống là thiếu hoặc thừa dấu). */
export function PunctSlip({ t, got }: { t: string; got: string }) {
  const name = (c: string) => (punctInfo(c) ? ` (${punctInfo(c).name})` : '');
  if (t && got)
    return (
      <>
        Cần <Han className="text-lg">{punctShown(t)}</Han>
        {name(t)} mà gõ <Han className="text-lg">{punctShown(got)}</Han>
        {name(got)}
      </>
    );
  if (t)
    return (
      <>
        Thiếu dấu <Han className="text-lg">{punctShown(t)}</Han>
        {name(t)}
      </>
    );
  return (
    <>
      Thừa dấu <Han className="text-lg">{punctShown(got)}</Han>
      {name(got)}
    </>
  );
}
