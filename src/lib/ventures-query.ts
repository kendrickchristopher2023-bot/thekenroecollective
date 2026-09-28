import { queryOptions } from "@tanstack/react-query";
import { listVentures } from "@/lib/ventures.functions";

/**
 * Lives outside src/routes/index.tsx on purpose.
 *
 * TanStack's route splitter moves `loader` into a shared chunk and the
 * component into a lazy chunk. A module-scope const in the route file that both
 * halves reference gets hoisted into the shared module as an *export* — but only
 * if the splitter can see it. Declaring it inside the route file produced
 * `The requested module '/src/routes/index.tsx?tsr-shared=1' does not provide an
 * export named 'venturesQueryOptions'` at hydration time, which killed client
 * hydration for the entire app (every route rendered SSR-only: no effects, no
 * auth, no interactivity). Keeping it in its own module makes the reference
 * unambiguous for both chunks.
 */
export const venturesQueryOptions = queryOptions({
  queryKey: ["ventures"],
  queryFn: () => listVentures(),
});
