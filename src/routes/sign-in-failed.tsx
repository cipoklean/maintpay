import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SignInFailedPanel } from "@/components/maintpay/sign-in-failed";

export const Route = createFileRoute("/sign-in-failed")({
  component: SignInFailedPage,
  head: () => ({
    meta: [{ title: "Sign-in didn't finish · MaintPay" }],
  }),
});

function SignInFailedPage() {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    setCode(new URLSearchParams(window.location.search).get("error"));
  }, []);
  return <SignInFailedPanel code={code} />;
}
