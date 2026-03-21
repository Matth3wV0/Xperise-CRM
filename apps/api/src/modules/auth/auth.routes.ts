import type { FastifyInstance } from "fastify";
import { prisma } from "@xperise/database";
import { loginSchema, registerSchema } from "@xperise/shared";
import bcrypt from "bcryptjs";
import { authenticate, authorize } from "../../common/auth-guard";

export async function authRoutes(server: FastifyInstance) {
  // POST /auth/login
  server.post("/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!user || !user.passwordHash) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    if (!user.isActive) {
      return reply.status(403).send({ error: "Account deactivated" });
    }

    const token = server.jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
    };
  });

  // POST /auth/register (Admin only)
  server.post(
    "/register",
    { preHandler: authorize("ADMIN") },
    async (request, reply) => {
      const body = registerSchema.parse(request.body);

      const existing = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (existing) {
        return reply.status(409).send({ error: "Email already exists" });
      }

      const passwordHash = await bcrypt.hash(body.password, 12);

      const user = await prisma.user.create({
        data: {
          email: body.email,
          name: body.name,
          passwordHash,
          role: body.role,
          provider: "EMAIL",
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      return { user };
    }
  );

  // GET /auth/me
  server.get(
    "/me",
    { preHandler: authenticate },
    async (request) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatar: true,
          createdAt: true,
        },
      });

      return { user };
    }
  );

  // GET /auth/users (Admin/Manager)
  server.get(
    "/users",
    { preHandler: authorize("ADMIN", "MANAGER") },
    async () => {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { name: "asc" },
      });

      return { users };
    }
  );
}
