import type { FastifyRequest, FastifyReply } from "fastify";
import type { Role } from "@xperise/database";

interface JwtPayload {
  id: string;
  email: string;
  role: Role;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: "Unauthorized" });
  }
}

export function authorize(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (!roles.includes(request.user.role)) {
      reply.status(403).send({ error: "Forbidden" });
    }
  };
}
