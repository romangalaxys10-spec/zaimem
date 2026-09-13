import { db } from "@/lib/db";
import { BUILTIN_SKILLS } from "./skills";

/** Seed builtin skills (incl. the zcode-smart-skill port) for a user. Idempotent. */
export async function seedBuiltinSkills(userId: string) {
  for (const s of BUILTIN_SKILLS) {
    await db.skill.upsert({
      where: { userId_name: { userId, name: s.name } },
      update: {
        description: s.description,
        triggers: JSON.stringify(s.triggers),
        body: s.body,
        source: "builtin",
      },
      create: {
        userId,
        name: s.name,
        description: s.description,
        triggers: JSON.stringify(s.triggers),
        body: s.body,
        source: "builtin",
      },
    });
  }
}
