import { closeLot, declareLot, lotStateAt } from "../domain/proposition-lot.ts";
import type { PropositionLot } from "../domain/proposition.ts";
import type { PropositionStore, PropositionUnitOfWork, Writer } from "./write-tokens.ts";

export const liveLotOf = async (
  store: PropositionStore,
  { writer, now }: { readonly writer: Writer; readonly now: Date },
): Promise<PropositionLot | undefined> => {
  const current = await store.findOpenLot(writer);
  if (current === undefined || lotStateAt({ lot: current, now }) === "open") {
    return current;
  }
  await store.closeLot(current.id);
  return undefined;
};

export type OpenedBatch = {
  readonly lot: PropositionLot;
  readonly closed: PropositionLot | null;
};

export type ClosedBatch = { readonly lot: PropositionLot | null };

export const openBatch =
  ({
    unitOfWork,
    newId,
    now,
  }: {
    readonly unitOfWork: PropositionUnitOfWork;
    readonly newId: () => string;
    readonly now: () => Date;
  }) =>
  ({ intention, ...writer }: Writer & { readonly intention: string }): Promise<OpenedBatch> =>
    unitOfWork.run(async (store) => {
      const openedAt = now();
      const { lot, closed } = declareLot({
        current: await liveLotOf(store, { writer, now: openedAt }),
        declared: {
          id: newId(),
          ...writer,
          intention,
          state: "open",
          openedAt,
          lastWrittenAt: openedAt,
        },
      });
      if (closed !== null) {
        await store.closeLot(closed.id);
      }
      return { lot: await store.openLotOf(lot), closed };
    });

export const closeBatch =
  ({ unitOfWork, now }: { readonly unitOfWork: PropositionUnitOfWork; readonly now: () => Date }) =>
  (writer: Writer): Promise<ClosedBatch> =>
    unitOfWork.run(async (store) => {
      const current = await liveLotOf(store, { writer, now: now() });
      if (current === undefined) {
        return { lot: null };
      }
      await store.closeLot(current.id);
      return { lot: closeLot(current) };
    });
