import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { navigate } from "../lib/router";
import { useReportedMutation } from "../lib/toast";
import { Button, Field, inputClass, Modal } from "./ui";

/**
 * The "+ New" behind the Chain plans group: pick a chain that has no plan this
 * year, or name a brand-new chain without the detour through Manage. Either
 * way the plan lands with the phase 1–4 template stamped on it.
 */
export function NewChainPlanModal({
  seasonId,
  seasonLabel,
  planless,
  onClose,
}: {
  seasonId: Id<"seasons">;
  seasonLabel: string;
  planless: ReadonlyArray<{ _id: Id<"chains">; name: string }>;
  onClose: () => void;
}) {
  const createChain = useReportedMutation(api.chains.create);
  const createPlan = useReportedMutation(api.chainPlans.create);

  const [chainId, setChainId] = useState<Id<"chains"> | "">(planless[0]?._id ?? "");
  const [newName, setNewName] = useState("");

  const usingNew = newName.trim() !== "";
  const ready = usingNew || chainId !== "";

  const submit = async () => {
    let target: Id<"chains"> | "" = chainId;
    if (usingNew) {
      const chain = await createChain({ name: newName });
      if (!chain.ok) return;
      target = chain.value;
    }
    if (target === "") return;
    const plan = await createPlan({ seasonId, chainId: target });
    if (!plan.ok) return;
    onClose();
    navigate({ name: "plan", chainPlanId: plan.value });
  };

  return (
    <Modal
      title={`New chain plan for ${seasonLabel}`}
      onClose={onClose}
      footer={
        <>
          <Button size="md" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="md" variant="primary" disabled={!ready} onClick={submit}>
            Create plan
          </Button>
        </>
      }
    >
      {planless.length > 0 && (
        <Field label="Chain" hint="Only chains without a plan this year are listed.">
          <select
            value={usingNew ? "" : chainId}
            disabled={usingNew}
            onChange={(event) => {
              const next = planless.find((chain) => chain._id === event.target.value);
              setChainId(next?._id ?? "");
            }}
            className="h-9 w-full cursor-pointer rounded-md border border-ink-700 bg-ink-950 px-2 text-sm text-ink-100 transition hover:border-ink-500 focus:border-sand-500 focus:outline-none disabled:opacity-40"
          >
            {planless.map((chain) => (
              <option key={chain._id} value={chain._id}>
                {chain.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field
        label={planless.length > 0 ? "…or a new chain" : "Chain name"}
        hint="Typing a name here creates the chain and its plan together."
      >
        <input
          autoFocus={planless.length === 0}
          value={newName}
          placeholder="Vons"
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && ready) void submit();
          }}
          className={inputClass}
        />
      </Field>
      <p className="text-2xs text-ink-500">
        One plan per chain per year. The new plan starts with the phase 1–4 template checklist —
        undated and unassigned until you say otherwise.
      </p>
    </Modal>
  );
}
