import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";

export const metadata: Metadata = { title: "Edit quotation · Poojary Prefab" };

// The id is read on the client (useParams); data comes from the repository in the browser.
export default function EditQuotationPage() {
  return <ClientOnly screen="edit" />;
}
