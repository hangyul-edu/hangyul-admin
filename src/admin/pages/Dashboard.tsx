// The dashboard lives in ./dashboard: the page and its data hook, the
// sections (alerts, headline numbers, the two chart cards), the recent-activity
// cards, and the charts. Re-exported here so routes and tests keep importing
// from "./Dashboard".
export { DashboardPage } from "./dashboard/DashboardPage";
export { monthLabel } from "./dashboard/sections";
export { TimeseriesChart } from "./dashboard/charts";
export { AdminActivityRow } from "./dashboard/recent";
