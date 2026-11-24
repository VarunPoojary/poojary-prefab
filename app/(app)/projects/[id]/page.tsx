import { redirect } from "next/navigation";

/** The Details tab is the default view of a project. */
export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  redirect(`/projects/${id}/details`);
}
