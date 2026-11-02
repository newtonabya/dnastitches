"use client";

import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  type KeyboardCoordinateGetter,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";

import type { CustomOrderStatus } from "@/generated/prisma/enums";
import { ALLOWED_TRANSITIONS, STATUS_LABELS } from "@/lib/custom-order/status";
import { cn } from "@/lib/utils";
import type { updateCustomOrderStatus } from "@/server/actions/admin/orders";
import type { PipelineCard, PipelineStatus } from "@/server/data/admin/orders";

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

/**
 * Keyboard dragging (dnd-kit KeyboardSensor): Space/Enter picks a card up, Left/Right
 * jump straight to the neighbouring column, Space/Enter drops, Escape cancels.
 */
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const { collisionRect, droppableContainers } = context;
  if (!collisionRect || (event.code !== "ArrowRight" && event.code !== "ArrowLeft"))
    return undefined;
  event.preventDefault();
  // Read column positions from the DOM so a key pressed right after pick-up works
  // even before dnd-kit has finished measuring droppables.
  const columns = droppableContainers
    .getEnabled()
    .flatMap((c) => (c.node.current ? [c.node.current.getBoundingClientRect()] : []))
    .sort((a, b) => a.left - b.left);
  const centre = collisionRect.left + collisionRect.width / 2;
  const current = columns.findIndex((r) => centre >= r.left && centre <= r.left + r.width);
  const target = columns[current + (event.code === "ArrowRight" ? 1 : -1)];
  if (!target) return undefined;
  return { x: target.left + target.width / 2 - collisionRect.width / 2, y: target.top + 48 };
};

type Move = { id: string; to: CustomOrderStatus };

/**
 * US-C1 Kanban: one column per non-terminal status. Moves are optimistic and roll
 * back (the card snaps back) if the server rejects them, e.g. "Deposit not yet paid."
 */
export function PipelineBoard({
  cards,
  columns,
  action,
}: {
  cards: PipelineCard[];
  columns: readonly PipelineStatus[];
  action: typeof updateCustomOrderStatus;
}) {
  const [optimisticCards, applyMove] = useOptimistic(cards, (state, move: Move) =>
    state.map((c) => (c.id === move.id ? { ...c, status: move.to } : c)),
  );
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );

  const byId = new Map(optimisticCards.map((c) => [c.id, c]));

  function move(card: PipelineCard, to: CustomOrderStatus) {
    if (to === card.status) return;
    setFeedback(undefined);
    startTransition(async () => {
      applyMove({ id: card.id, to });
      const fd = new FormData();
      fd.set("orderId", card.id);
      fd.set("to", to);
      fd.set("expectedFrom", card.status);
      const result = await action(null, fd);
      setFeedback(
        result.ok
          ? { ok: true, text: `${card.reference} moved to ${STATUS_LABELS[to]}.` }
          : {
              ok: false,
              text: `${card.reference}: ${result.formError ?? "Couldn't move this order."}`,
            },
      );
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const card = byId.get(String(active.id));
    if (!card || !over) return;
    move(card, over.id as CustomOrderStatus);
  }

  const label = (id: string | number) => byId.get(String(id))?.reference ?? String(id);
  const column = (id: string | number | undefined) =>
    id === undefined ? "no column" : (STATUS_LABELS[id as CustomOrderStatus] ?? String(id));
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up order ${label(active.id)}. Use left and right arrows to change column.`,
    onDragOver: ({ active, over }) => `Order ${label(active.id)} is over ${column(over?.id)}.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped order ${label(active.id)} in ${column(over.id)}.`
        : `Order ${label(active.id)} was not moved.`,
    onDragCancel: ({ active }) => `Moving order ${label(active.id)} was cancelled.`,
  };

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" role="status" className="min-h-6 text-sm">
        {feedback ? (
          <p
            className={feedback.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}
          >
            {feedback.text}
          </p>
        ) : pending ? (
          <p className="text-muted-foreground">Saving…</p>
        ) : null}
      </div>
      <DndContext
        sensors={sensors}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To move an order, press Space or Enter to pick it up, use the left and right arrow keys to choose a column, then press Space or Enter to drop it, or Escape to cancel.",
          },
        }}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {columns.map((status) => (
            <Column
              key={status}
              status={status}
              cards={optimisticCards.filter((c) => c.status === status)}
              onMove={move}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({
  status,
  cards,
  onMove,
}: {
  status: PipelineStatus;
  cards: PipelineCard[];
  onMove: (card: PipelineCard, to: CustomOrderStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABELS[status]} (${cards.length})`}
      data-testid={`column-${status}`}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-2",
        isOver && "ring-2 ring-primary",
      )}
    >
      <h2 className="flex items-center justify-between px-1 text-sm font-semibold">
        {STATUS_LABELS[status]}
        <span className="font-normal text-muted-foreground tabular-nums">{cards.length}</span>
      </h2>
      <ul className="flex min-h-24 flex-col gap-2">
        {cards.map((card) => (
          <li key={card.id}>
            <Card card={card} onMove={onMove} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Card({
  card,
  onMove,
}: {
  card: PipelineCard;
  onMove: (card: PipelineCard, to: CustomOrderStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });
  const next = ALLOWED_TRANSITIONS[card.status];
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      data-testid="pipeline-card"
      data-status={card.status}
      aria-label={`${card.reference}: ${card.title}`}
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-background p-3 text-sm shadow-xs",
        isDragging && "z-10 shadow-lg",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/admin/orders/${card.id}`} className="font-medium hover:underline">
          {card.reference}
        </Link>
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label={`Drag ${card.reference} to another column`}
          className="cursor-grab rounded px-1 text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          ⠿
        </button>
      </div>
      <p className="line-clamp-2">{card.title}</p>
      <p className="text-xs text-muted-foreground">
        {card.customerName ?? card.customerEmail}
        {card.targetDate ? ` · due ${dateFormat.format(card.targetDate)}` : ""}
        {card.source ? ` · from ${card.source}` : ""}
      </p>
      {next.length > 0 ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="sr-only">Move {card.reference} to</span>
          <select
            value=""
            onChange={(e) => e.target.value && onMove(card, e.target.value as CustomOrderStatus)}
            className="h-7 w-full rounded border border-input bg-transparent px-1"
          >
            <option value="">Move to…</option>
            {next.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </article>
  );
}
