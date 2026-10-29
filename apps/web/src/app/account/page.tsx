import AccountHomePage from "./account-client";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return <AccountHomePage commerceEnabled={process.env.FREE_LAUNCH_MODE !== "true"} />;
}
