import { closeLot, declareLot } from "../domain/proposition-lot.ts";
import type { PropositionLot } from "../domain/proposition.ts";
import type { PropositionUnitOfWork, Writer } from "./write-tokens.ts";

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
      const { lot, closed } = declareLot({
        current: await store.findOpenLot(writer),
        declared: { id: newId(), ...writer, intention, state: "open", openedAt: now() },
      });
      if (closed !== null) {
        await store.closeLot(closed.id);
      }
      return { lot: await store.openLotOf(lot), closed };
    });

export const closeBatch =
  ({ unitOfWork }: { readonly unitOfWork: PropositionUnitOfWork }) =>
  (writer: Writer): Promise<ClosedBatch> =>
    unitOfWork.run(async (store) => {
      const current = await store.findOpenLot(writer);
      if (current === undefined) {
        return { lot: null };
      }
      await store.closeLot(current.id);
      return { lot: closeLot(current) };
    });
