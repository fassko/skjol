import { connection } from "next/server";
import { handleFreightMcp } from "@/lib/freight-mcp";

export const maxDuration = 120;

async function serve(req: Request) {
  await connection();
  return handleFreightMcp(req);
}

export function GET(req: Request) {
  return serve(req);
}

export function POST(req: Request) {
  return serve(req);
}

export function DELETE(req: Request) {
  return serve(req);
}
