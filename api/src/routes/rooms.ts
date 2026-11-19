import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { currentUser } from "../auth.js";
import { STAFF } from "../access.js";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { seatDto, seatRows } from "../serializers.js";

export const roomsRouter = Router();

const seatSpec = z.object({
  col: z.number().int().min(0).max(500),
  label: z.string().trim().min(1).max(20).optional(),
  accessible: z.boolean().optional(),
  leftHanded: z.boolean().optional(),
  broken: z.boolean().optional(),
});

// A row is either a seat count ("12" -> cols 0..11) or an explicit list of
// seats whose `col` values can skip numbers for aisles. Rows can differ in
// length, so rooms don't have to be rectangles.
const rowSpec = z.object({
  label: z.string().trim().min(1).max(10).optional(),
  seats: z.union([z.number().int().min(1).max(500), z.array(seatSpec).min(1).max(500)]),
});

const roomBody = z.object({
  name: z.string().trim().min(1).max(100),
  building: z.string().trim().max(100).optional(),
  rows: z.array(rowSpec).min(1).max(200),
});

const seatPatch = z.object({
  accessible: z.boolean().optional(),
  leftHanded: z.boolean().optional(),
  broken: z.boolean().optional(),
});

/** Row labels A..Z, then AA, AB, ... */
export function rowLabel(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

function buildSeats(rows: z.infer<typeof rowSpec>[]) {
  const seats: { row: number; col: number; label: string; accessible: boolean; leftHanded: boolean; broken: boolean }[] = [];
  const labels = new Set<string>();
  rows.forEach((r, row) => {
    const prefix = r.label ?? rowLabel(row);
    const specs = typeof r.seats === "number" ? Array.from({ length: r.seats }, (_, col) => ({ col })) : r.seats;
    const cols = new Set<number>();
    for (const s of specs as z.infer<typeof seatSpec>[]) {
      if (cols.has(s.col)) throw badRequest(`Row ${prefix} has two seats at position ${s.col}`);
      cols.add(s.col);
      const label = s.label ?? `${prefix}${s.col + 1}`;
      if (labels.has(label)) throw badRequest(`Seat label ${label} is used twice`);
      labels.add(label);
      seats.push({
        row,
        col: s.col,
        label,
        accessible: s.accessible ?? false,
        leftHanded: s.leftHanded ?? false,
        broken: s.broken ?? false,
      });
    }
  });
  return seats;
}

function roomDto(room: { id: string; name: string; building: string | null; createdById: string | null }, seats: Parameters<typeof seatRows>[0]) {
  return {
    id: room.id,
    name: room.name,
    building: room.building,
    createdById: room.createdById,
    capacity: seats.filter((s) => !s.broken).length,
    rows: seatRows(seats).map((r) => ({ row: r.row, seats: r.seats.map(seatDto) })),
  };
}

/** Room creator, or staff of a course that has an exam in this room, may edit it. */
async function assertCanEditRoom(userId: string, roomId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound("Room");
  if (room.createdById === userId) return room;
  const staffExam = await prisma.examRoom.findFirst({
    where: {
      roomId,
      exam: { course: { members: { some: { userId, status: "ACTIVE", role: { in: STAFF } } } } },
    },
  });
  if (!staffExam) throw forbidden("Only the room's creator or staff of an exam in this room can edit it");
  return room;
}

roomsRouter.post("/", async (req, res) => {
  const body = roomBody.parse(req.body);
  const seats = buildSeats(body.rows);
  const room = await prisma.room.create({
    data: { name: body.name, building: body.building, createdById: currentUser(req).id, seats: { create: seats } },
    include: { seats: true },
  });
  res.status(201).json({ room: roomDto(room, room.seats) });
});

roomsRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const rooms = await prisma.room.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { building: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: [{ building: "asc" }, { name: "asc" }],
    include: { _count: { select: { seats: { where: { broken: false } } } } },
  });
  res.json({
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, building: r.building, capacity: r._count.seats })),
  });
});

roomsRouter.get("/:roomId", async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.roomId }, include: { seats: true } });
  if (!room) throw notFound("Room");
  res.json({ room: roomDto(room, room.seats) });
});

// Replace a room's layout. Not allowed once any exam has seats assigned in it.
roomsRouter.put("/:roomId", async (req, res) => {
  const room = await assertCanEditRoom(currentUser(req).id, req.params.roomId);
  const body = roomBody.parse(req.body);
  const seats = buildSeats(body.rows);
  const inUse = await prisma.seatAssignment.count({ where: { roomId: room.id } });
  if (inUse > 0) {
    throw conflict("room_in_use", "Students are already seated in this room; edit individual seats instead");
  }
  const updated = await prisma.$transaction(async (tx) => {
    await tx.seat.deleteMany({ where: { roomId: room.id } });
    return tx.room.update({
      where: { id: room.id },
      data: { name: body.name, building: body.building, seats: { create: seats } },
      include: { seats: true },
    });
  });
  res.json({ room: roomDto(updated, updated.seats) });
});

// Mark one seat accessible / left-handed / broken.
roomsRouter.patch("/:roomId/seats/:seatId", async (req, res) => {
  await assertCanEditRoom(currentUser(req).id, req.params.roomId);
  const body = seatPatch.parse(req.body);
  const seat = await prisma.seat.findFirst({ where: { id: req.params.seatId, roomId: req.params.roomId } });
  if (!seat) throw notFound("Seat");
  const updated = await prisma.seat.update({ where: { id: seat.id }, data: body });
  // Warn the caller if a student is already seated on a seat that just broke.
  const seatedStudents = body.broken
    ? await prisma.seatAssignment.count({ where: { seatId: seat.id } })
    : 0;
  res.json({
    seat: seatDto(updated),
    warnings: seatedStudents > 0 ? [`${seatedStudents} exam seating(s) still use this seat; move those students`] : [],
  });
});
