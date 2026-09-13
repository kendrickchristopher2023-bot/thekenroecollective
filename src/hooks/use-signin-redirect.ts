import { useEffect, useState } from "react";

/**
 * Where to send someone back to after they sign in.
 *
 * Reading `window.location` while rendering makes the sign-in link's address
 * different on the server than in the browser, and Safari on iPhone treated
 * that difference as a broken page: it threw away the server's HTML and drew
 * the whole page again (the "#422" reports on the events home and Studio
 * pages). Returning nothing on the first render and filling the destination in
 * straight after keeps both renders identical.
 */
export function useSignInRedirect(): { redirect?: string } {
  const [search, setSearch] = useState<{ redirect?: string }>({});

  useEffect(() => {
    const here = window.location.pathname + window.location.search;
    if (here.startsWith("/auth") || here.startsWith("/reset-password")) {
      setSearch({});
      return;
    }
    setSearch({ redirect: here });
  }, []);

  return search;
}
