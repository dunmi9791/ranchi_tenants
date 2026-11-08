import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
  // Units come from the database at request time, not at build time.
  await connection();
  const properties = await prisma.property.findMany({
    where: { units: { some: {} } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      units: { orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });
  return <RegisterForm properties={properties} />;
}
