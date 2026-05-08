"use client";

import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
};

const fmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toLocalString(date: Date, time: string): string {
  // Render as YYYY-MM-DDTHH:MM in local zone — matches what <input type="datetime-local"> produced.
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  return `${y}-${m}-${d}T${time}`;
}

function parse(value: string): { date: Date | undefined; time: string } {
  if (!value) return { date: undefined, time: "00:00" };
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return { date: undefined, time: "00:00" };
  const [, y, mo, d, h, mi] = m as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return { date, time: `${h}:${mi}` };
}

export function DateTimePicker({ id, value, onChange, placeholder, className }: Props) {
  const { date, time } = parse(value);
  const labelText = date ? fmt.format(new Date(`${value}:00`)) : (placeholder ?? "Pick date");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start font-normal",
            !date && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon data-icon="inline-start" />
          {labelText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (!d) {
              onChange("");
              return;
            }
            onChange(toLocalString(d, time));
          }}
          autoFocus
        />
        <div className="border-t p-3">
          <Input
            type="time"
            step={60}
            value={time}
            disabled={!date}
            onChange={(e) => {
              if (!date) return;
              onChange(toLocalString(date, e.target.value || "00:00"));
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
