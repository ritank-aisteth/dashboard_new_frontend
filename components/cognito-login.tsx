"use client";

import { useRef, useState } from "react";
import {
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
  type ICognitoStorage,
  type IAuthenticationCallback,
} from "amazon-cognito-identity-js";

interface PublicCognitoConfiguration {
  userPoolId: string;
  clientId: string;
}

const values = new Map<string, string>();
const memoryStorage: ICognitoStorage = {
  setItem(key, value) { values.set(key, value); },
  getItem(key) { return values.get(key) ?? null; },
  removeItem(key) { values.delete(key); },
  clear() { values.clear(); },
};

function isConfiguration(value: unknown): value is PublicCognitoConfiguration {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return typeof Reflect.get(value, "userPoolId") === "string" && typeof Reflect.get(value, "clientId") === "string";
}

function failureMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = Reflect.get(error, "code");
    const message = Reflect.get(error, "message");
    if (code === "NotAuthorizedException" || code === "UserNotFoundException") return "Cognito rejected the username or password. Use the exact Cognito username if email sign-in is not enabled.";
    if (code === "UserNotConfirmedException") return "This Cognito account has not been confirmed.";
    if (code === "PasswordResetRequiredException") return "A password reset is required for this account.";
    if (code === "CodeMismatchException") return "The verification code is incorrect.";
    if (code === "ExpiredCodeException") return "The verification code has expired. Request a new code.";
    if (code === "LimitExceededException") return "Too many attempts. Please wait before trying again.";
    if (code === "InvalidPasswordException") return typeof message === "string" && message.trim() ? message.trim() : "The new password does not meet the Cognito password policy.";
    if (code === "UnexpectedLambdaException" || code === "InvalidLambdaResponseException" || code === "CodeDeliveryFailureException") return "Cognito could not deliver the reset code because its email Lambda is unavailable. Contact the AWS administrator.";
    if (typeof message === "string" && message.trim()) return `Cognito: ${message.trim()}`;
  }
  return "Sign-in could not be completed. Please try again.";
}

function attributeLabel(attribute: string): string {
  const labels: Record<string, string> = {
    name: "Full name",
    given_name: "First name",
    family_name: "Last name",
    middle_name: "Middle name",
    nickname: "Nickname",
    phone_number: "Phone number",
  };
  return labels[attribute] ?? attribute.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export function HostedUiLogin(): React.ReactNode {
  return <a className="button primary auth-button" href="/api/auth/login">Continue to secure sign in</a>;
}

export function CognitoLogin(): React.ReactNode {
  const [mode, setMode] = useState<"sign-in" | "forgot-request" | "forgot-confirm">("sign-in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<"SMS_MFA" | "SOFTWARE_TOKEN_MFA" | "NEW_PASSWORD_REQUIRED" | null>(null);
  const [requiredAttributes, setRequiredAttributes] = useState<string[]>([]);
  const [newUserAttributes, setNewUserAttributes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [delivery, setDelivery] = useState("");
  const [busy, setBusy] = useState(false);
  const userRef = useRef<CognitoUser | null>(null);

  async function configuredUser(login: string): Promise<CognitoUser> {
    const response = await fetch("/api/auth/config", { cache: "no-store" });
    const payload: unknown = await response.json();
    if (!response.ok || !isConfiguration(payload)) throw new Error("Authentication is not configured");
    const pool = new CognitoUserPool({ UserPoolId: payload.userPoolId, ClientId: payload.clientId, Storage: memoryStorage });
    return new CognitoUser({ Username: login, Pool: pool, Storage: memoryStorage });
  }

  async function establishSession(session: CognitoUserSession): Promise<void> {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: session.getIdToken().getJwtToken() }),
    });
    userRef.current?.signOut();
    memoryStorage.clear();
    if (!response.ok) {
      setBusy(false);
      setError(response.status === 403 ? "Your account does not have dashboard access." : "Authentication could not be verified.");
      return;
    }
    window.location.reload();
  }

  function callbacks(): IAuthenticationCallback {
    return {
      onSuccess(session) { void establishSession(session); },
      onFailure(authError: unknown) { memoryStorage.clear(); setBusy(false); setError(failureMessage(authError)); },
      mfaRequired() { setChallenge("SMS_MFA"); setBusy(false); },
      totpRequired() { setChallenge("SOFTWARE_TOKEN_MFA"); setBusy(false); },
      newPasswordRequired(userAttributes: unknown, required: unknown) {
        const attributes = Array.isArray(required)
          ? required
              .filter((attribute): attribute is string => typeof attribute === "string")
              .map((attribute) => attribute.replace(/^userAttributes\./, ""))
          : [];
        const existing = typeof userAttributes === "object" && userAttributes !== null && !Array.isArray(userAttributes)
          ? userAttributes as Record<string, unknown>
          : {};
        setRequiredAttributes(attributes);
        setNewUserAttributes(Object.fromEntries(attributes.map((attribute) => {
          const value = existing[attribute] ?? existing[`userAttributes.${attribute}`];
          return [attribute, typeof value === "string" ? value : ""];
        })));
        setChallenge("NEW_PASSWORD_REQUIRED");
        setBusy(false);
      },
    };
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username.trim(), password }),
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      setBusy(false);
      if (response.status === 401) setError("Cognito rejected the username or password. Use the exact Cognito username if email sign-in is not enabled.");
      else if (response.status === 403) setError("Your Cognito account needs confirmation, a password change, or dashboard access.");
      else if (response.status === 429) setError("Too many attempts. Please wait before trying again.");
      else setError("Authentication is temporarily unavailable.");
    } catch {
      setBusy(false);
      setError("Authentication is temporarily unavailable.");
    }
  }

  async function requestPasswordReset(event?: React.FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();
    const login = username.trim();
    if (!login) {
      setError("Enter your email or phone number first.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const user = await configuredUser(login);
      userRef.current = user;
      user.forgotPassword({
        onSuccess() { setMode("forgot-confirm"); setBusy(false); },
        onFailure(resetError: Error) { setBusy(false); setError(failureMessage(resetError)); },
        inputVerificationCode(data: unknown) {
          const details = typeof data === "object" && data !== null ? Reflect.get(data, "CodeDeliveryDetails") : null;
          const destination = typeof details === "object" && details !== null ? Reflect.get(details, "Destination") : null;
          const medium = typeof details === "object" && details !== null ? Reflect.get(details, "DeliveryMedium") : null;
          setDelivery(typeof destination === "string" ? `${typeof medium === "string" ? medium.toLowerCase() : "message"} sent to ${destination}` : "A verification code was sent to your registered contact.");
          setMode("forgot-confirm");
          setBusy(false);
        },
      });
    } catch {
      memoryStorage.clear();
      setBusy(false);
      setError("Password reset is temporarily unavailable.");
    }
  }

  function confirmPasswordReset(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!userRef.current) {
      setMode("forgot-request");
      setError("Request a new verification code.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    userRef.current.confirmPassword(code.trim(), newPassword, {
      onSuccess() {
        userRef.current?.signOut();
        userRef.current = null;
        memoryStorage.clear();
        setPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setCode("");
        setDelivery("");
        setMode("sign-in");
        setBusy(false);
        setNotice("Password reset successfully. Sign in with your new password.");
      },
      onFailure(resetError: Error) { setBusy(false); setError(failureMessage(resetError)); },
    });
  }

  function confirmMfa(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!challenge || !userRef.current) return;
    setBusy(true);
    setError("");
    userRef.current.sendMFACode(code.trim(), {
      onSuccess(session) { void establishSession(session); },
      onFailure(authError: unknown) { setBusy(false); setError(failureMessage(authError)); },
    }, challenge);
  }

  function completeNewPassword(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!userRef.current) return;
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    const missingAttribute = requiredAttributes.find((attribute) => !newUserAttributes[attribute]?.trim());
    if (missingAttribute) {
      setError(`${attributeLabel(missingAttribute)} is required.`);
      return;
    }
    const attributes = Object.fromEntries(requiredAttributes.map((attribute) => [attribute, (newUserAttributes[attribute] ?? "").trim()]));
    setBusy(true);
    setError("");
    userRef.current.completeNewPasswordChallenge(newPassword, attributes, callbacks());
  }

  if (challenge === "NEW_PASSWORD_REQUIRED") {
    return <form className="auth-form" onSubmit={completeNewPassword}>
      {requiredAttributes.map((attribute) => {
        const inputId = `new-attribute-${attribute.replace(/[^a-z0-9_-]/gi, "-")}`;
        return <div className="auth-field" key={attribute}>
          <label htmlFor={inputId}>{attributeLabel(attribute)}</label>
          <input
            id={inputId}
            type={attribute === "phone_number" ? "tel" : "text"}
            autoComplete={attribute === "name" ? "name" : attribute === "given_name" ? "given-name" : attribute === "family_name" ? "family-name" : attribute === "phone_number" ? "tel" : "off"}
            value={newUserAttributes[attribute] ?? ""}
            onChange={(event) => setNewUserAttributes((current) => ({ ...current, [attribute]: event.target.value }))}
            required
            maxLength={256}
          />
        </div>;
      })}
      <label htmlFor="new-password">Create permanent password</label>
      <input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event)=>setNewPassword(event.target.value)} required minLength={8} maxLength={256}/>
      <label htmlFor="confirm-password">Confirm permanent password</label>
      <input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} required minLength={8} maxLength={256}/>
      {error&&<p className="auth-error" role="alert">{error}</p>}
      <button className="button primary auth-button" type="submit" disabled={busy}>{busy?"Updating password…":"Set password and sign in"}</button>
    </form>;
  }

  if (challenge) {
    return <form className="auth-form" onSubmit={confirmMfa}>
      <label htmlFor="mfa-code">Verification code</label>
      <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event)=>setCode(event.target.value)} required maxLength={8}/>
      {error&&<p className="auth-error" role="alert">{error}</p>}
      <button className="button primary auth-button" type="submit" disabled={busy}>{busy?"Verifying…":"Verify code"}</button>
    </form>;
  }

  if (mode === "forgot-request") {
    return <form className="auth-form" onSubmit={(event)=>{void requestPasswordReset(event)}}>
      <p className="auth-help">Enter the email address or phone number linked to your Cognito account.</p>
      <label htmlFor="reset-username">Email or phone number</label>
      <input id="reset-username" autoComplete="username" value={username} onChange={(event)=>setUsername(event.target.value)} required maxLength={254}/>
      {error&&<p className="auth-error" role="alert">{error}</p>}
      <button className="button primary auth-button" type="submit" disabled={busy}>{busy?"Sending code…":"Send verification code"}</button>
      <button className="auth-link" type="button" disabled={busy} onClick={()=>{setMode("sign-in");setError("")}}>Back to sign in</button>
    </form>;
  }

  if (mode === "forgot-confirm") {
    return <form className="auth-form" onSubmit={confirmPasswordReset}>
      <p className="auth-help">{delivery||"Enter the verification code and choose a new password."}</p>
      <label htmlFor="reset-code">Verification code</label>
      <input id="reset-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event)=>setCode(event.target.value)} required minLength={4} maxLength={8}/>
      <label htmlFor="reset-password">New password</label>
      <input id="reset-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event)=>setNewPassword(event.target.value)} required minLength={8} maxLength={256}/>
      <label htmlFor="reset-confirm-password">Confirm new password</label>
      <input id="reset-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} required minLength={8} maxLength={256}/>
      {error&&<p className="auth-error" role="alert">{error}</p>}
      <button className="button primary auth-button" type="submit" disabled={busy}>{busy?"Resetting password…":"Reset password"}</button>
      <div className="auth-link-row"><button className="auth-link" type="button" disabled={busy} onClick={()=>{void requestPasswordReset()}}>Resend code</button><button className="auth-link" type="button" disabled={busy} onClick={()=>{setMode("sign-in");setError("")}}>Back to sign in</button></div>
    </form>;
  }

  return <form className="auth-form" onSubmit={(event)=>{void signIn(event)}}>
    <label htmlFor="cognito-username">Email or phone number</label>
    <input id="cognito-username" autoComplete="username" value={username} onChange={(event)=>setUsername(event.target.value)} required maxLength={254}/>
    <label htmlFor="cognito-password">Password</label>
    <input id="cognito-password" type="password" autoComplete="current-password" value={password} onChange={(event)=>setPassword(event.target.value)} required maxLength={256}/>
    <button className="auth-link auth-forgot" type="button" disabled={busy} onClick={()=>{setMode("forgot-request");setError("");setNotice("")}}>Forgot password?</button>
    {notice&&<p className="auth-success" role="status">{notice}</p>}
    {error&&<p className="auth-error" role="alert">{error}</p>}
    <button className="button primary auth-button" type="submit" disabled={busy}>{busy?"Signing in…":"Sign in securely"}</button>
  </form>;
}
