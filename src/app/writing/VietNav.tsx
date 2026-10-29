/** Đầu trang Viết tay: tiêu đề và thanh chuyển giữa Tập viết, Xem cách viết, In 田字格. */
import { SectionNav } from '../ui';

const ITEMS = [
  { id: 'tap', label: 'Tập viết', href: 'viet/' },
  { id: 'cau', label: 'Xem cách viết', href: 'viet/cau/' },
  { id: 'in', label: 'In 田字格', href: 'viet/in/' },
] as const;

export function VietNav({ current }: { current: (typeof ITEMS)[number]['id'] }) {
  return (
    <div data-print-hide className="mb-4">
      <h1 className="text-2xl font-semibold">Viết tay</h1>
      <SectionNav label="Viết tay" current={current} items={ITEMS} />
    </div>
  );
}
