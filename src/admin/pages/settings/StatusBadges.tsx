import { STATUS_TEXT, type Status } from "./model";

export function StatusDot({ status }: { status: Status }) {
  return <span className={`hgadm-cfg__dot hgadm-cfg__dot--${status}`} aria-hidden />;
}

export function StatusPill({ status, label }: { status: Status; label?: string }) {
  if (status === "settings") return null;
  return (
    <span className={`hgadm-cfg__pill hgadm-cfg__pill--${status}`}>
      <StatusDot status={status} />
      {label || STATUS_TEXT[status]}
    </span>
  );
}
