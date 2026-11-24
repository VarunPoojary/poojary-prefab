import { redirect } from "next/navigation";

/** The Details tab is the default view of an employee. */
export default async function EmployeePage({ params }: PageProps<"/employees/[id]">) {
  const { id } = await params;
  redirect(`/employees/${id}/details`);
}
