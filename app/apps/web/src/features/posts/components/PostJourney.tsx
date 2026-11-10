import React from 'react';
export function PostJourney({ active }: { active: number }): React.JSX.Element {
  return (
    <ol aria-label="Post workflow" className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
      {['Choose product', 'Plan content', 'Create & preview', 'Team review', 'Ready to share'].map(
        (label, index) => (
          <li
            key={label}
            aria-current={active === index ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-xl border p-3 ${index === active ? 'border-[#20313d] bg-[#20313d] text-white' : index < active ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-neutral-200 bg-white text-neutral-500'}`}
          >
            <span aria-hidden="true" className="font-semibold">
              {index < active ? '✓' : index + 1}
            </span>
            <span>{label}</span>
          </li>
        ),
      )}
    </ol>
  );
}
