"use client";

import { useEffect, useId, useState } from "react";

export type ChoiceCategory = {
  id: string;
  label: string;
  color: string;
  icon: string;
};

export type CategorizedChoice = {
  id: string;
  category: string;
  label: string;
  color: string;
  icon: string;
  enabled: boolean;
};

export function CategorizedChoicePicker({
  categories,
  choices,
  selectedId,
  customValue,
  selectionLabel,
  ariaLabel,
  placeholder,
  onSelect,
  onCustom,
}: {
  categories: readonly ChoiceCategory[];
  choices: readonly CategorizedChoice[];
  selectedId: string;
  customValue: string;
  selectionLabel: string;
  ariaLabel: string;
  placeholder: string;
  onSelect: (id: string) => void;
  onCustom: (value: string) => void;
}) {
  const panelId = useId();
  const selectedChoice = choices.find((item) => item.enabled && item.id === selectedId);
  const [category, setCategory] = useState(selectedChoice?.category ?? categories[0]?.id ?? "");

  useEffect(() => {
    if (selectedChoice && selectedChoice.category !== category) setCategory(selectedChoice.category);
  }, [category, selectedChoice]);

  const visible = choices.filter((item) => item.enabled && item.category === category);
  const selectedCategory = categories.find((item) => item.id === selectedChoice?.category);

  return <section className="emotion-diary" aria-label={ariaLabel}>
    <div className="emotion-tabs" role="tablist" aria-label={`${ariaLabel} 분류`}>
      {categories.map((item) => <button
        type="button"
        role="tab"
        aria-selected={category === item.id}
        aria-controls={panelId}
        key={item.id}
        className={`emotion-tab emotion-${item.color}`}
        onClick={() => setCategory(item.id)}
      ><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}
    </div>
    <div id={panelId} role="tabpanel" aria-label={categories.find((item) => item.id === category)?.label}>
      <div className="emotion-paper-grid" role="radiogroup" aria-label={`${ariaLabel} 선택`}>
        {visible.map((item, index) => {
          const selected = selectedId === item.id;
          return <button
            type="button"
            role="radio"
            key={item.id}
            className={`emotion-paper emotion-${item.color} emotion-angle-${index % 3} ${selected ? "selected" : ""}`}
            aria-checked={selected}
            onClick={() => onSelect(item.id)}
          ><small aria-hidden="true">{item.icon}</small>{item.label}<span className="emotion-check" aria-hidden="true">✓</span></button>;
        })}
      </div>
    </div>
    <label className="custom-emotion-note"><span>직접 적기</span><input value={customValue} maxLength={30} placeholder={placeholder} onChange={(event) => onCustom(event.target.value)} /><small>{customValue.length}/30</small></label>
    {(selectedChoice || customValue.trim()) && <div className="emotion-selection-summary" aria-live="polite"><span>{selectionLabel}</span><strong>{selectedChoice && selectedCategory ? `${selectedCategory.label} · ${selectedChoice.label}` : `직접 적기 · ${customValue.trim()}`}</strong></div>}
  </section>;
}
