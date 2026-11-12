import { createFileRoute } from "@tanstack/react-router";
import { SampleWalk } from "@/components/maintpay/sample-walk";

export const Route = createFileRoute("/sample")({
  component: SamplePage,
  head: () => ({
    meta: [{ title: "Sample job · MaintPay" }, { name: "description", content: "A read-only example of how MaintPay holds or explains a payment. No payment is made." }],
  }),
});

function SamplePage() {
  return (
    <main>
      <SampleWalk />
    </main>
  );
}
