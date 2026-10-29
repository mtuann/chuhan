/**
 * Dấu câu tiếng Trung: dấu toàn khổ (rộng một ô chữ), hai loại dấu phẩy (， chỗ ngừng trong câu, 、 ngăn các từ, cụm từ
 * ngắn khi liệt kê: lỗi người Việt hay mắc), bảng các dấu khác kèm phím gõ (bộ gõ của app; Sogou, Microsoft Pinyin, Bính
 * âm của macOS cũng vậy khi bật dấu câu tiếng Trung). Trang Gõ chữ có mục này ở `#dau-cau`; lời giải thích lỗi dấu câu
 * có bản mở ngay tại chỗ (`inline`).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Han } from '../ui';

export const Key = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-line bg-paper px-1 font-mono font-semibold">{children}</kbd>
);

/** Phím → dấu: ", → ，". */
export function KeyTo({ k, m }: { k: string; m: string }) {
  return (
    <span className="whitespace-nowrap">
      <Key>{k}</Key> → <Han>{m}</Han>
    </span>
  );
}

const MARKS: { m: string; zh: string; name: string; keys: string[]; use: ReactNode; ex?: string }[] = [
  {
    m: '，',
    zh: '逗号',
    name: 'Dấu phẩy',
    keys: [','],
    use: 'Chỗ ngừng trong câu: giữa hai vế, sau lời gọi, sau phần mở đầu câu (như dấu phẩy tiếng Việt, trừ khi liệt kê).',
    ex: '今天天气很好，我们去公园吧。',
  },
  {
    m: '、',
    zh: '顿号',
    name: 'Dấu ngắt liệt kê',
    keys: ['\\'],
    use: (
      <>
        Giữa các từ, cụm từ ngắn ngang hàng khi liệt kê; không đặt dấu trước <Han>和</Han>, <Han>或</Han> nối món cuối.
      </>
    ),
    ex: '我喜欢苹果、香蕉和西瓜。',
  },
  {
    m: '。',
    zh: '句号',
    name: 'Dấu chấm tròn',
    keys: ['.'],
    use: (
      <>
        Hết câu kể, lời đề nghị nói nhẹ (<Han>请…</Han>, <Han>…吧</Han>).
      </>
    ),
    ex: '我是越南人。',
  },
  {
    m: '？',
    zh: '问号',
    name: 'Dấu hỏi',
    keys: ['?'],
    use: (
      <>
        Hết câu hỏi (kể cả câu có <Han>吗</Han>, <Han>呢</Han>). Câu kể có từ để hỏi vẫn hết bằng dấu chấm tròn: <Han>我不知道他叫什么名字。</Han>
      </>
    ),
    ex: '你是中国人吗？',
  },
  { m: '！', zh: '叹号', name: 'Dấu chấm than', keys: ['!'], use: 'Câu cảm thán, câu mệnh lệnh nói mạnh.', ex: '太好了！' },
  { m: '：', zh: '冒号', name: 'Dấu hai chấm', keys: [':'], use: 'Trước lời nói trực tiếp, trước phần giải thích hoặc liệt kê.', ex: '我家有三口人：爸爸、妈妈和我。' },
  { m: '；', zh: '分号', name: 'Dấu chấm phẩy', keys: [';'], use: 'Ngăn các vế câu dài ngang hàng.' },
  {
    m: '“ ”',
    zh: '引号',
    name: 'Ngoặc kép',
    keys: ['"'],
    use: 'Lời nói trực tiếp, lời trích, từ được nhắc tới. Phím " gõ lần đầu ra ngoặc mở, lần sau ra ngoặc đóng.',
    ex: '他说：“我们走吧。”',
  },
  { m: '《 》', zh: '书名号', name: 'Ngoặc tên sách', keys: ['<', '>'], use: 'Tên sách, báo, phim, bài hát.', ex: '我在看《西游记》。' },
  { m: '（ ）', zh: '括号', name: 'Ngoặc đơn', keys: ['(', ')'], use: 'Chú thích thêm.' },
  { m: '……', zh: '省略号', name: 'Dấu chấm lửng', keys: ['^'], use: 'Sáu chấm, chiếm hai ô: lời bỏ lửng, liệt kê chưa hết.' },
  { m: '——', zh: '破折号', name: 'Dấu gạch ngang', keys: ['_'], use: 'Chiếm hai ô: giải thích thêm, chuyển ý.' },
];

/** ， và 、: điểm người Việt hay nhầm nhất. */
function TwoCommas() {
  return (
    <div className="rounded-xl border-2 border-accent p-3 text-sm">
      <p className="font-semibold">
        Hai loại dấu phẩy: <Han className="text-lg">，</Han> và <Han className="text-lg">、</Han>
      </p>
      <ul className="mt-2 space-y-2">
        <li>
          <Han className="text-lg">，</Han> <b>dấu phẩy</b> (phím <Key>,</Key>): chỗ ngừng trong câu, như dấu phẩy tiếng Việt: giữa hai vế, sau lời
          gọi, sau phần mở đầu câu.
          <Han className="block text-lg">今天天气很好，我们去公园吧。</Han>
        </li>
        <li>
          <Han className="text-lg">、</Han> <b>dấu ngắt liệt kê</b> (phím <Key>\</Key>): giữa các từ, cụm từ ngắn ngang hàng khi liệt kê. Món cuối nối
          bằng <Han>和</Han> hoặc <Han>或</Han> thì không đặt dấu trước <Han>和</Han>, <Han>或</Han>.
          <Han className="block text-lg">我喜欢苹果、香蕉和西瓜。</Han>
        </li>
        <li>
          <span className="font-semibold text-t1">✗ Sai:</span> <Han className="text-lg">我喜欢苹果，香蕉和西瓜。</Han>
          <span className="block text-muted">Liệt kê mà dùng dấu phẩy: lỗi người Việt rất hay mắc, vì tiếng Việt chỉ có một loại dấu phẩy.</span>
        </li>
        <li className="text-muted">
          Món liệt kê dài, hoặc mỗi nhóm đã có <Han>、</Han> hay <Han>和</Han> bên trong, thì các nhóm ngăn nhau bằng dấu phẩy.
        </li>
      </ul>
    </div>
  );
}

function Intro() {
  return (
    <div className="space-y-2 text-sm">
      <p>
        Dấu câu tiếng Trung rộng bằng một chữ Hán (dấu toàn khổ) và không có dấu cách theo sau. Bộ gõ của app tự đổi phím ra dấu toàn khổ:{' '}
        <span className="inline-flex flex-wrap gap-x-3">
          <KeyTo k="," m="，" />
          <KeyTo k="." m="。" />
          <KeyTo k="\" m="、" />
          <KeyTo k="?" m="？" />
          <KeyTo k="!" m="！" />
        </span>
      </p>
      <p className="text-muted">
        Trên máy tính, bộ gõ Sogou, Microsoft Pinyin, Bính âm của macOS dùng đúng các phím trong bảng khi đang bật dấu câu tiếng Trung. Trên điện thoại,
        các bài gõ câu, gõ đoạn văn, nhắn tin có hàng nút dấu ngay dưới ô gõ.
      </p>
    </div>
  );
}

function MarkList() {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-card text-sm">
      {MARKS.map((x) => (
        <li key={x.m} className="flex items-start gap-3 px-3 py-2">
          <Han className="w-14 shrink-0 text-center text-2xl leading-tight">{x.m}</Han>
          <div className="min-w-0">
            <p>
              <b>{x.name}</b> <Han className="text-muted">{x.zh}</Han> · phím{' '}
              {x.keys.map((k, i) => (
                <span key={k}>
                  {i > 0 && ' '}
                  <Key>{k}</Key>
                </span>
              ))}
            </p>
            <p className="text-muted">{x.use}</p>
            {x.ex && <Han className="block text-base">{x.ex}</Han>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Cách dùng và cách gõ dấu câu tiếng Trung. Mặc định là một mục của trang (có tiêu đề, `id="dau-cau"`; vào trang bằng
 * `#dau-cau` thì cuộn tới và mở bảng dấu); `inline`: khối thu gọn, mở ra ngay trong lời giải thích lỗi.
 */
export function PunctGuide({ inline = false }: { inline?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [hash] = useState(() => typeof window !== 'undefined' && window.location.hash === '#dau-cau');
  useEffect(() => {
    if (hash && !inline) ref.current?.scrollIntoView();
  }, [hash, inline]);
  if (inline)
    return (
      <details className="rounded-lg border border-line px-3 py-2">
        <summary className="min-h-9 cursor-pointer py-1 font-semibold">Cách dùng và cách gõ dấu câu tiếng Trung</summary>
        <div className="mt-2 space-y-3">
          <TwoCommas />
          <Intro />
          <MarkList />
        </div>
      </details>
    );
  return (
    <section ref={ref} id="dau-cau" aria-labelledby="dau-cau-h" className="scroll-mt-4 space-y-3 rounded-2xl border border-line p-4">
      <h2 id="dau-cau-h" className="font-semibold">
        Dấu câu tiếng Trung
      </h2>
      <Intro />
      <TwoCommas />
      <details open={hash} className="text-sm">
        <summary className="min-h-9 cursor-pointer py-1 font-semibold">Các dấu khác và phím gõ</summary>
        <div className="mt-2">
          <MarkList />
        </div>
      </details>
    </section>
  );
}
