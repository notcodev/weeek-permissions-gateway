"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "./datetime-picker";
import { trpc } from "@/lib/trpc-client";
import type { SubKeyPublic } from "@/server/trpc/routers/subKey";

const ANY = "__any__";

type Props = {
  workspaceId: string;
  workspaceName: string;
  subKeys: SubKeyPublic[];
};

type Filters = {
  from: string;
  to: string;
  subKeyId: string;
  statusMin: string;
  statusMax: string;
  denyReason: string;
  pathContains: string;
};

const EMPTY_FILTERS: Filters = {
  from: "",
  to: "",
  subKeyId: "",
  statusMin: "",
  statusMax: "",
  denyReason: "",
  pathContains: "",
};

const DENY_REASON_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Any" },
  { value: "unauthenticated", label: "Unauthenticated" },
  { value: "verb_missing", label: "Verb missing" },
  { value: "project_not_in_scope", label: "Project not in scope" },
  { value: "board_not_in_scope", label: "Board not in scope" },
  { value: "unknown_route", label: "Unknown route" },
];

const fmtDateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

function statusBadgeVariant(status: number): "default" | "secondary" | "destructive" | "outline" {
  if (status >= 500) return "destructive";
  if (status >= 400) return "secondary";
  if (status >= 200 && status < 300) return "default";
  return "outline";
}

function readFiltersFromParams(sp: URLSearchParams): Filters {
  return {
    from: sp.get("from") ?? "",
    to: sp.get("to") ?? "",
    subKeyId: sp.get("subKeyId") ?? "",
    statusMin: sp.get("statusMin") ?? "",
    statusMax: sp.get("statusMax") ?? "",
    denyReason: sp.get("denyReason") ?? "",
    pathContains: sp.get("pathContains") ?? "",
  };
}

function filtersToQueryString(filters: Filters): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v.trim().length > 0) sp.set(k, v.trim());
  }
  const s = sp.toString();
  return s.length === 0 ? "" : `?${s}`;
}

export function AuditLogViewer({ workspaceId, workspaceName, subKeys }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<Filters>(() =>
    readFiltersFromParams(new URLSearchParams(searchParams.toString())),
  );
  const [applied, setApplied] = useState<Filters>(draft);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Sync the URL with the applied filters whenever they change. Doesn't push
  // history entries on every keystroke — only on Apply.
  useEffect(() => {
    const qs = filtersToQueryString(applied);
    router.replace(`?${qs.startsWith("?") ? qs.slice(1) : qs}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  const searchInput = useMemo(() => {
    const out: Record<string, unknown> = { workspaceId };
    if (applied.from) out.from = new Date(applied.from).toISOString();
    if (applied.to) out.to = new Date(applied.to).toISOString();
    if (applied.subKeyId) out.subKeyId = applied.subKeyId;
    if (applied.statusMin) out.statusMin = Number.parseInt(applied.statusMin, 10);
    if (applied.statusMax) out.statusMax = Number.parseInt(applied.statusMax, 10);
    if (applied.denyReason) out.denyReason = applied.denyReason;
    if (applied.pathContains) out.pathContains = applied.pathContains;
    return out;
  }, [applied, workspaceId]);

  const statsQ = trpc.audit.stats.useQuery({
    workspaceId,
    ...(applied.from ? { from: new Date(applied.from).toISOString() } : {}),
    ...(applied.to ? { to: new Date(applied.to).toISOString() } : {}),
  });

  const searchQ = trpc.audit.search.useInfiniteQuery(
    searchInput as Parameters<typeof trpc.audit.search.useInfiniteQuery>[0],
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  );

  const flatItems = useMemo(
    () => (searchQ.data?.pages ?? []).flatMap((p) => p.items),
    [searchQ.data],
  );

  function applyDraft() {
    setApplied(draft);
    setExpandedId(null);
  }

  function resetFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setExpandedId(null);
  }

  return (
    <div className="grid gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Audit log</h1>
          <p className="text-muted-foreground text-sm">{workspaceName}</p>
        </div>
        <Button variant="outline" onClick={resetFilters} disabled={searchQ.isFetching}>
          Reset filters
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Stats for the selected period</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Total" value={statsQ.data?.total ?? "—"} />
          <Stat label="2xx" value={statsQ.data?.statusBuckets["2xx"] ?? "—"} />
          <Stat label="4xx" value={statsQ.data?.statusBuckets["4xx"] ?? "—"} />
          <Stat label="5xx" value={statsQ.data?.statusBuckets["5xx"] ?? "—"} />
          <Stat
            label="p50 latency"
            value={statsQ.data?.latencyMs.p50 != null ? `${Math.round(statsQ.data.latencyMs.p50)}ms` : "—"}
          />
          <Stat
            label="p95 latency"
            value={statsQ.data?.latencyMs.p95 != null ? `${Math.round(statsQ.data.latencyMs.p95)}ms` : "—"}
          />
          <Stat
            label="Denies"
            value={Object.values(statsQ.data?.denyBreakdown ?? {}).reduce((a, b) => a + b, 0) || "—"}
          />
          <Stat
            label="Top deny"
            value={(() => {
              const map = statsQ.data?.denyBreakdown ?? {};
              let best: [string, number] | null = null;
              for (const [k, v] of Object.entries(map)) {
                if (!best || v > best[1]) best = [k, v];
              }
              return best ? `${best[0]} (${best[1]})` : "—";
            })()}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <aside className="grid h-fit gap-3 rounded-md border p-4">
          <h2 className="text-sm font-semibold">Filters</h2>
          <FilterField label="From" htmlFor="from">
            <DateTimePicker
              id="from"
              value={draft.from}
              onChange={(next) => setDraft({ ...draft, from: next })}
              placeholder="Any time"
            />
          </FilterField>
          <FilterField label="To" htmlFor="to">
            <DateTimePicker
              id="to"
              value={draft.to}
              onChange={(next) => setDraft({ ...draft, to: next })}
              placeholder="Any time"
            />
          </FilterField>
          <FilterField label="Sub-key" htmlFor="subKey">
            <Select
              value={draft.subKeyId === "" ? ANY : draft.subKeyId}
              onValueChange={(v) => setDraft({ ...draft, subKeyId: v === ANY ? "" : v })}
            >
              <SelectTrigger id="subKey">
                <SelectValue placeholder="Any sub-key" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ANY}>Any sub-key</SelectItem>
                  {subKeys.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.label} ({k.last4})
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </FilterField>
          <div className="grid grid-cols-2 gap-2">
            <FilterField label="Status ≥" htmlFor="statusMin">
              <Input
                id="statusMin"
                type="number"
                min={100}
                max={599}
                value={draft.statusMin}
                onChange={(e) => setDraft({ ...draft, statusMin: e.target.value })}
              />
            </FilterField>
            <FilterField label="Status ≤" htmlFor="statusMax">
              <Input
                id="statusMax"
                type="number"
                min={100}
                max={599}
                value={draft.statusMax}
                onChange={(e) => setDraft({ ...draft, statusMax: e.target.value })}
              />
            </FilterField>
          </div>
          <FilterField label="Deny reason" htmlFor="denyReason">
            <Select
              value={draft.denyReason === "" ? ANY : draft.denyReason}
              onValueChange={(v) => setDraft({ ...draft, denyReason: v === ANY ? "" : v })}
            >
              <SelectTrigger id="denyReason">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {DENY_REASON_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value === "" ? ANY : o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Path contains" htmlFor="pathContains">
            <Input
              id="pathContains"
              type="text"
              value={draft.pathContains}
              onChange={(e) => setDraft({ ...draft, pathContains: e.target.value })}
              placeholder="e.g. /tm/tasks"
            />
          </FilterField>
          <Button onClick={applyDraft} disabled={searchQ.isFetching}>
            {searchQ.isFetching ? "Loading…" : "Apply filters"}
          </Button>
        </aside>

        <section className="grid gap-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Verb</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Deny</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {searchQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground text-center">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : flatItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground text-center">
                    No audit rows match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                flatItems.map((row) => (
                  <ExpandableRow
                    key={row.id}
                    row={row}
                    expanded={expandedId === row.id}
                    onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
                  />
                ))
              )}
            </TableBody>
          </Table>
          {searchQ.hasNextPage ? (
            <Button
              variant="outline"
              onClick={() => searchQ.fetchNextPage()}
              disabled={searchQ.isFetchingNextPage}
            >
              {searchQ.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-lg font-medium tabular-nums">{value}</div>
    </div>
  );
}

function FilterField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

type AuditRow = {
  id: string;
  workspaceId: string;
  subKeyId: string | null;
  requestId: string;
  method: string;
  path: string;
  query: string | null;
  ourStatus: number;
  upstreamStatus: string;
  latencyMs: number;
  verb: string | null;
  denyReason: string | null;
  hasIpHash: boolean;
  userAgent: string | null;
  createdAt: Date;
};

function ExpandableRow({
  row,
  expanded,
  onToggle,
}: {
  row: AuditRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow onClick={onToggle} className="cursor-pointer">
        <TableCell className="text-xs whitespace-nowrap">
          {fmtDateTime.format(new Date(row.createdAt))}
        </TableCell>
        <TableCell className="text-xs font-mono">{row.method}</TableCell>
        <TableCell className="max-w-md truncate text-xs font-mono">{row.path}</TableCell>
        <TableCell>
          <Badge variant={statusBadgeVariant(row.ourStatus)}>{row.ourStatus}</Badge>
        </TableCell>
        <TableCell className="text-xs font-mono text-muted-foreground">{row.verb ?? "—"}</TableCell>
        <TableCell className="text-xs tabular-nums">{row.latencyMs}ms</TableCell>
        <TableCell className="text-xs text-muted-foreground">{row.denyReason ?? ""}</TableCell>
      </TableRow>
      {expanded ? (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/40">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              <Detail label="Request ID" value={row.requestId} mono />
              <Detail label="Sub-key ID" value={row.subKeyId ?? "—"} mono />
              <Detail label="Upstream status" value={row.upstreamStatus} mono />
              <Detail label="Has IP hash" value={row.hasIpHash ? "yes" : "no"} />
              <Detail
                label="Query"
                value={row.query ?? ""}
                mono
                wrap
              />
              <Detail label="User agent" value={row.userAgent ?? "—"} wrap />
            </dl>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function Detail({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`${mono ? "font-mono" : ""} ${wrap ? "break-all" : "truncate"}`}
        title={value}
      >
        {value || "—"}
      </dd>
    </div>
  );
}
