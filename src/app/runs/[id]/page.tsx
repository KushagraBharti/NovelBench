import { redirect } from "next/navigation";

export default async function RunsDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/run/${id}`);
}
