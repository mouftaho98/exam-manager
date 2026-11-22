import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { forbidden, notFound } from "../errors.js";

const router = Router();
router.use(requireAuth);

function requireInstructor(req: any, _res: any, next: any) {
  if (req.user?.role !== "INSTRUCTOR") return next(forbidden("Instructor role required"));
  next();
}

const createRoomSchema = z.object({
  name: z.string().min(1),
  rows: z.number().int().min(1).max(50),
  cols: z.number().int().min(1).max(50),
  // optional: list of {row, col, seatType}
  specialSeats: z.array(z.object({
    row: z.number().int().min(0),
    col: z.number().int().min(0),
    seatType: z.enum(["NORMAL", "LEFT_HANDED", "ACCESSIBLE", "BROKEN"]),
  })).optional(),
});

router.post("/", requireInstructor, async (req, res, next) => {
  try {
    const data = createRoomSchema.parse(req.body);
    const room = await prisma.room.create({
      data: {
        name: data.name,
        createdBy: req.user!.userId,
        seats: {
          create: (() => {
            const specials = new Map<string, string>();
            (data.specialSeats || []).forEach(s => specials.set(`${s.row},${s.col}`, s.seatType));
            const seats: any[] = [];
            for (let r = 0; r < data.rows; r++) {
              for (let c = 0; c < data.cols; c++) {
                const key = `${r},${c}`;
                seats.push({
                  row: r,
                  col: c,
                  label: `${String.fromCharCode(65 + r)}${c + 1}`,
                  seatType: (specials.get(key) as any) || "NORMAL",
                });
              }
            }
            return seats;
          })(),
        },
      },
      include: { seats: true },
    });
    res.status(201).json({ room });
  } catch (err) {
    next(err);
  }
});

router.get("/", requireInstructor, async (req, res, next) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { createdBy: req.user!.userId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { seats: true } } },
    });
    res.json({ rooms });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireInstructor, async (req, res, next) => {
  try {
    const room = await prisma.room.findFirst({
      where: { id: req.params.id, createdBy: req.user!.userId },
      include: { seats: { orderBy: [{ row: "asc" }, { col: "asc" }] } },
    });
    if (!room) throw notFound("Room");
    res.json({ room });
  } catch (err) {
    next(err);
  }
});

const updateSeatSchema = z.object({
  seatType: z.enum(["NORMAL", "LEFT_HANDED", "ACCESSIBLE", "BROKEN"]),
});

router.patch("/:roomId/seats/:seatId", requireInstructor, async (req, res, next) => {
  try {
    const room = await prisma.room.findFirst({
      where: { id: req.params.roomId, createdBy: req.user!.userId },
    });
    if (!room) throw notFound("Room");
    const data = updateSeatSchema.parse(req.body);
    const seat = await prisma.seat.findFirst({
      where: { id: req.params.seatId, roomId: room.id },
    });
    if (!seat) throw notFound("Seat");
    const updated = await prisma.seat.update({
      where: { id: seat.id },
      data: { seatType: data.seatType },
    });
    res.json({ seat: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
