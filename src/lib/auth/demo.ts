export function demoAutoVerifyEnabled(env: { MAINTPAY_DEMO_AUTO_VERIFY?: string }) {
  return env.MAINTPAY_DEMO_AUTO_VERIFY === "true";
}
