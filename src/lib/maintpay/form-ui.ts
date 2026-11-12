import { nearToYocto } from "./control.ts";

const REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export type AgreementInput = {
  task: string;
  criteria: string;
  repository: string;
  worker: string;
  approver: string;
  recipient: string;
  amount: string;
  expiry: string;
  wallet: string;
  walletChecked: boolean;
  recipientChecked: boolean;
  clientEmail: string;
};

/** What “Check this” shows. Account ids stay continuous. Hex is grouped by 4. */
export function checkReading(value: string): { kind: "empty" | "near" | "hex"; stored: string; shown: string } {
  const stored = value.trim().toLowerCase();
  if (!stored) return { kind: "empty", stored: "", shown: "" };
  if (HEX64.test(stored)) {
    const groups = stored.match(/.{4}/g);
    return { kind: "hex", stored, shown: groups ? groups.join(" ") : stored };
  }
  return { kind: "near", stored, shown: stored };
}

export function validateAgreement(input: AgreementInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const task = input.task.trim();
  if (task.length < 8 || task.length > 180) {
    errors.task = task.length === 0 ? "Say what needs doing." : "Describe the work in a short sentence.";
  }
  const criteria = input.criteria.trim();
  if (criteria.length < 8 || criteria.length > 400) {
    errors.criteria = criteria.length === 0 ? "Say how you will know it is done." : "Say how you will know the work is done.";
  }
  if (!REPO.test(input.repository.trim())) errors.repository = "Use a repository like owner/name.";

  const worker = input.worker.trim().toLowerCase();
  const approver = input.approver.trim().toLowerCase();
  const client = input.clientEmail.trim().toLowerCase();
  if (!EMAIL.test(worker)) errors.worker = "Use the contributor’s email.";
  if (!EMAIL.test(approver)) errors.approver = "Use the approver’s email.";
  if (!errors.worker && !errors.approver && worker === approver) {
    errors.approver = "The approver and the contributor must be different people.";
  }
  if (!errors.approver && client && EMAIL.test(client) && approver === client) {
    errors.approver = "The approver must not be the person paying.";
  }
  if (!errors.worker && client && EMAIL.test(client) && worker === client) {
    errors.worker = "The contributor must not be the person paying.";
  }

  const recipient = input.recipient.trim().toLowerCase();
  if (!(HEX64.test(recipient) || ACCOUNT.test(recipient))) {
    errors.recipient = recipient ? "That recipient is not a NEAR account." : "Enter the NEAR account that should be paid.";
  } else if (!input.recipientChecked) {
    errors.recipientCheck = "Open Check this and read the account before saving.";
  }

  const amount = nearToYocto(input.amount);
  if (!amount || amount === "0") errors.amount = "Enter an amount greater than zero.";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiry)) errors.expiry = "Choose the day the offer expires.";
  else {
    const end = new Date(`${input.expiry}T23:59:00`);
    if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) errors.expiry = "The expiry must be in the future.";
  }

  const wallet = input.wallet.trim().toLowerCase();
  if (!HEX64.test(wallet)) {
    errors.wallet = wallet ? "The dedicated wallet must be a 64-character testnet address." : "Enter the dedicated wallet address.";
  } else if (!input.walletChecked) {
    errors.walletCheck = "Open Check this and read the wallet address before saving.";
  }

  return errors;
}

export const AGREEMENT_FOCUS_ORDER = [
  "task",
  "criteria",
  "repository",
  "worker",
  "approver",
  "recipient",
  "recipientCheck",
  "amount",
  "expiry",
  "wallet",
  "walletCheck",
] as const;
