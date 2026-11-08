import { notFound } from "next/navigation";
import { PassportUnavailable, PassportView } from "@/components/passport/passport-view";
import { getPublicPassport, type PublicPassport } from "@/modules/donations/application/passport-service";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let p: PublicPassport | null;
  try { p = await getPublicPassport(token); }
  catch (e) { console.error("passaporte público", e); return <PassportUnavailable />; }
  // Token inválido ou inexistente: o mesmo 404, sem dizer qual dos dois.
  if (!p) notFound();
  return <PassportView p={p} />;
}
