import { ChevronRight, LayoutGrid } from "lucide-react";
import type { SettingsPageData } from "../../api";
import { StatusDot } from "./StatusBadges";

/** Left column: the overview entry, then every integration by group. */
export function IntegrationList({
  data,
  selectedId,
  onSelect,
}: {
  data: SettingsPageData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <nav className="hgadm-cfg__list" aria-label="설정 항목">
      <button
        type="button"
        className={`hgadm-cfg__item hgadm-cfg__item--overview ${selectedId === null ? "is-active" : ""}`}
        aria-current={selectedId === null ? "page" : undefined}
        onClick={() => onSelect(null)}
      >
        <LayoutGrid size={16} strokeWidth={2} aria-hidden />
        <span className="hgadm-cfg__item-name">개요</span>
      </button>
      {data.groups.map((group) => (
        <div key={group.id} className="hgadm-cfg__list-group" role="group" aria-labelledby={`cfg-group-${group.id}`}>
          <div id={`cfg-group-${group.id}`} className="hgadm-cfg__list-label">
            {group.label}
          </div>
          {group.integrations.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`hgadm-cfg__item ${item.id === selectedId ? "is-active" : ""}`}
              aria-current={item.id === selectedId ? "page" : undefined}
              onClick={() => onSelect(item.id)}
            >
              <StatusDot status={item.status} />
              <span className="hgadm-cfg__item-name">{item.name}</span>
              {item.status !== "settings" && <span className="hgadm-cfg__item-status">{item.status_label}</span>}
              {item.restart_pending.length > 0 && <span className="hgadm-cfg__item-flag">재시작</span>}
              <ChevronRight className="hgadm-cfg__item-chevron" size={16} strokeWidth={2} aria-hidden />
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
