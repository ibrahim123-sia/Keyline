"use client";

import { CopyIcon, KeyRoundIcon, MoreHorizontalIcon, UserPlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { SelectField, TextInputField } from "@/components/admin/fields";
import { FormSection } from "@/components/admin/page-header";
import { actionErrorToast } from "@/components/admin/reauth-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createApiToken,
  inviteAdmin,
  resendInvite,
  resetAdminTwoFactor,
  revokeApiToken,
  setAdminActive,
} from "@/features/admin-users/manage";
import type { AdminRow, ApiTokenRow } from "@/features/admin-users/queries";
import type { ActionResult } from "@/lib/action-result";

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

function Badge({ tone, children }: { tone: "ok" | "muted" | "warn" | "danger"; children: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap",
        tone === "ok" && "bg-success-soft text-success",
        tone === "muted" && "bg-surface-muted text-text-muted",
        tone === "warn" && "bg-accent-soft text-ink",
        tone === "danger" && "bg-danger/10 text-danger",
      )}
    >
      {children}
    </span>
  );
}

/** 04 §12: admins (invite, deactivate, reset 2FA) and personal API tokens for MCP (10 §4). */
export function AdminUsersManager({
  admins,
  tokens,
  currentUserId,
  readOnly,
}: {
  admins: AdminRow[];
  tokens: ApiTokenRow[];
  currentUserId: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState<{ name: string; email: string } | null>(null);
  const [inviteErrors, setInviteErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const inviteForm = useId();

  async function run<T>(promise: Promise<ActionResult<T>>, success: string) {
    const res = await promise;
    if (!res.ok) return actionErrorToast(res, router);
    toast.success(success);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <FormSection
        title="Admins"
        description="Every admin can use the whole portal. Each one signs in with a password and two-step verification."
        actions={
          !readOnly && (
            <Button type="button" size="sm" onClick={() => setInviting({ name: "", email: "" })}>
              <UserPlusIcon /> Invite an admin
            </Button>
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-[12px] text-text-muted">
                <th scope="col" className="py-2 pe-3 text-start font-semibold">
                  Admin
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  Last sign-in
                </th>
                <th scope="col" className="py-2 ps-3 text-end font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const self = a.id === currentUserId;
                return (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pe-3">
                      <p
                        className={cn("font-semibold", a.isActive ? "text-ink" : "text-text-muted")}
                      >
                        {a.name}{" "}
                        {self && <span className="font-normal text-text-muted">(you)</span>}
                      </p>
                      <p className="text-text-muted">{a.email}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {!a.isActive ? (
                          <Badge tone="danger">Deactivated</Badge>
                        ) : a.pending ? (
                          <Badge tone="warn">Invite sent</Badge>
                        ) : (
                          <Badge tone="ok">Active</Badge>
                        )}
                        {a.twoFactorEnabled ? (
                          <Badge tone="ok">Two-step on</Badge>
                        ) : (
                          !a.pending && <Badge tone="muted">Two-step off</Badge>
                        )}
                        {a.readOnly && <Badge tone="muted">Read-only demo</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">
                      {a.lastLoginAt ? when.format(new Date(a.lastLoginAt)) : "Never"}
                    </td>
                    <td className="py-2.5 ps-3 text-end">
                      {!readOnly && (
                        <AdminActions
                          admin={a}
                          self={self}
                          busy={busy}
                          onAction={async (fn, success) => {
                            setBusy(true);
                            await run(fn(), success);
                            setBusy(false);
                          }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </FormSection>

      <ApiTokens tokens={tokens} currentUserId={currentUserId} readOnly={readOnly} />

      <Dialog open={inviting !== null} onOpenChange={(o) => !o && setInviting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite an admin</DialogTitle>
            <DialogDescription>
              They get an email with a link (valid for 7 days) to set a password, then set up
              two-step verification.
            </DialogDescription>
          </DialogHeader>
          {inviting && (
            <form
              id={inviteForm}
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const res = await inviteAdmin(inviting);
                setBusy(false);
                if (!res.ok) {
                  setInviteErrors(res.fieldErrors ?? {});
                  return actionErrorToast(res, router);
                }
                toast.success(`Invite sent to ${inviting.email}`);
                setInviting(null);
                setInviteErrors({});
                router.refresh();
              }}
            >
              <TextInputField
                label="Name"
                value={inviting.name}
                onChange={(name) => setInviting((v) => v && { ...v, name })}
                error={inviteErrors.name?.[0]}
              />
              <TextInputField
                label="Email"
                type="email"
                value={inviting.email}
                onChange={(email) => setInviting((v) => v && { ...v, email })}
                error={inviteErrors.email?.[0]}
              />
            </form>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInviting(null)}>
              Cancel
            </Button>
            <Button type="submit" form={inviteForm} disabled={busy}>
              {busy ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminActions({
  admin,
  self,
  busy,
  onAction,
}: {
  admin: AdminRow;
  self: boolean;
  busy: boolean;
  onAction: (fn: () => Promise<ActionResult<unknown>>, success: string) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<"deactivate" | "reset" | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${admin.name}`}
            disabled={busy}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {admin.pending && admin.isActive && (
            <DropdownMenuItem
              onSelect={() =>
                void onAction(() => resendInvite({ id: admin.id }), "Invite sent again")
              }
            >
              Resend invite
            </DropdownMenuItem>
          )}
          {admin.twoFactorEnabled && !self && (
            <DropdownMenuItem onSelect={() => setConfirm("reset")}>
              Reset two-step verification
            </DropdownMenuItem>
          )}
          {admin.isActive ? (
            <DropdownMenuItem className="text-danger" onSelect={() => setConfirm("deactivate")}>
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() =>
                void onAction(
                  () => setAdminActive({ id: admin.id, active: true }),
                  `${admin.name} can sign in again`,
                )
              }
            >
              Reactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmControlled
        open={confirm === "deactivate"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Deactivate ${admin.name}?`}
        description={
          self
            ? "You will be signed out straight away."
            : "They are signed out straight away and cannot sign in until reactivated."
        }
        confirmLabel="Deactivate"
        onConfirm={() =>
          onAction(
            () => setAdminActive({ id: admin.id, active: false }),
            `${admin.name} deactivated`,
          )
        }
      />
      <ConfirmControlled
        open={confirm === "reset"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Reset two-step verification for ${admin.name}?`}
        description="Use this when their phone is lost. They are signed out and set up an authenticator app again at the next sign-in."
        confirmLabel="Reset"
        onConfirm={() =>
          onAction(() => resetAdminTwoFactor({ id: admin.id }), "Two-step verification reset")
        }
      />
    </>
  );
}

/** ConfirmDialog opened from a menu item rather than its own trigger. */
function ConfirmControlled(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
}) {
  return <ConfirmDialog {...props} destructive />;
}

function ApiTokens({
  tokens,
  currentUserId,
  readOnly,
}: {
  tokens: ApiTokenRow[];
  currentUserId: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [creating, setCreating] = useState<{
    name: string;
    access: "read" | "propose";
    expires: "30" | "90" | "365" | "never";
  } | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <FormSection
      title="API tokens"
      description="For connecting Claude or other MCP clients to Lintel. Changes they propose wait for an admin to confirm them here."
      actions={
        !readOnly && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCreating({ name: "", access: "read", expires: "90" })}
          >
            <KeyRoundIcon /> Create a token
          </Button>
        )
      }
    >
      {shown && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-accent/40 bg-accent-soft p-3 text-[13px]"
        >
          <span className="font-semibold text-ink">
            Copy the token now: it is shown only this once.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-surface px-2 py-1 font-mono text-[12.5px] break-all text-ink">
              {shown}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                navigator.clipboard.writeText(shown).then(
                  () => toast.success("Copied"),
                  () => toast.error("Could not copy"),
                )
              }
            >
              <CopyIcon /> Copy
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShown(null)}>
              Done
            </Button>
          </div>
        </div>
      )}
      {tokens.length === 0 ? (
        <p className="text-[13px] text-text-muted">No tokens yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-[12px] text-text-muted">
                <th scope="col" className="py-2 pe-3 text-start font-semibold">
                  Token
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  Owner
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  Access
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  Last used
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  Status
                </th>
                <th scope="col" className="py-2 ps-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => {
                return (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pe-3">
                      <p className="font-semibold text-ink">{t.name}</p>
                      <p className="font-mono text-[12px] text-text-muted">{t.prefix}…</p>
                    </td>
                    <td className="px-3 py-2.5">
                      {t.ownerId === currentUserId ? "You" : t.ownerName}
                    </td>
                    <td className="px-3 py-2.5">
                      {t.scopes.includes("propose") ? "Read and propose changes" : "Read only"}
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">
                      {t.lastUsedAt ? when.format(new Date(t.lastUsedAt)) : "Never"}
                    </td>
                    <td className="px-3 py-2.5">
                      {t.revokedAt ? (
                        <Badge tone="muted">Revoked</Badge>
                      ) : t.expired ? (
                        <Badge tone="muted">Expired</Badge>
                      ) : (
                        <Badge tone="ok">
                          {t.expiresAt ? `Until ${day.format(new Date(t.expiresAt))}` : "No expiry"}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 ps-3 text-end">
                      {!readOnly && !t.revokedAt && (
                        <ConfirmDialog
                          trigger={
                            <Button type="button" variant="ghost" size="sm" className="text-danger">
                              Revoke
                            </Button>
                          }
                          title={`Revoke “${t.name}”?`}
                          description="Anything using it loses access at once."
                          confirmLabel="Revoke"
                          destructive
                          onConfirm={async () => {
                            const res = await revokeApiToken({ id: t.id });
                            if (!res.ok) return actionErrorToast(res, router);
                            toast.success("Token revoked");
                            router.refresh();
                          }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={creating !== null} onOpenChange={(o) => !o && setCreating(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create an API token</DialogTitle>
            <DialogDescription>The token acts as you. Keep it like a password.</DialogDescription>
          </DialogHeader>
          {creating && (
            <form
              id={formId}
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const res = await createApiToken({
                  name: creating.name,
                  access: creating.access,
                  expiresInDays:
                    creating.expires === "never"
                      ? null
                      : (Number(creating.expires) as 30 | 90 | 365),
                });
                setBusy(false);
                if (!res.ok) return actionErrorToast(res, router);
                setShown(res.data.token);
                setCreating(null);
                router.refresh();
              }}
            >
              <TextInputField
                label="Name"
                placeholder="e.g. Claude on my laptop"
                value={creating.name}
                onChange={(name) => setCreating((c) => c && { ...c, name })}
              />
              <SelectField
                label="Access"
                value={creating.access}
                onChange={(access) => setCreating((c) => c && { ...c, access })}
                options={[
                  { value: "read", label: "Read only" },
                  { value: "propose", label: "Read and propose changes (confirmed in Lintel)" },
                ]}
              />
              <SelectField
                label="Expires"
                value={creating.expires}
                onChange={(expires) => setCreating((c) => c && { ...c, expires })}
                options={[
                  { value: "30", label: "In 30 days" },
                  { value: "90", label: "In 90 days" },
                  { value: "365", label: "In a year" },
                  { value: "never", label: "Never (not recommended)" },
                ]}
              />
            </form>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreating(null)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} disabled={busy}>
              {busy ? "Creating…" : "Create token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormSection>
  );
}
