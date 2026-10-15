import { Select } from "./kit";
import { topikTypeCodes, topikTypeLabel } from "../lib/topik";

/**
 * Picks a TOPIK question type by name instead of asking for its code.
 *
 * With a section chosen only that section's types are offered, which is the
 * pairing the server requires. A stored code the list does not know (an older
 * or newly added type) stays selectable, so opening a record never changes it.
 */
export function TopikTypeSelect({
  value,
  onChange,
  section,
  disabled,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  section?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const codes = topikTypeCodes(section || undefined);
  const options = value && !codes.includes(value) ? [value, ...codes] : codes;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} id={id} aria-label={ariaLabel}>
      <option value="">선택 안 함</option>
      {options.map((code) => (
        <option key={code} value={code}>
          {topikTypeLabel(code)}
        </option>
      ))}
    </Select>
  );
}
