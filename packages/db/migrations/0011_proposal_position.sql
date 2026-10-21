ALTER TABLE "proposal" ADD COLUMN "position" bigint;--> statement-breakpoint
UPDATE "proposal" SET "position" = "ordered"."rank" FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS "rank" FROM "proposal") AS "ordered" WHERE "proposal"."id" = "ordered"."id";--> statement-breakpoint
ALTER TABLE "proposal" ALTER COLUMN "position" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal" ALTER COLUMN "position" ADD GENERATED ALWAYS AS IDENTITY (sequence name "proposal_position_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
SELECT setval('"proposal_position_seq"', coalesce(max("position"), 0) + 1, false) FROM "proposal";--> statement-breakpoint
-- La base numérote chaque proposition à l'insertion : un lot se lit et se valide dans l'ordre d'écriture, y compris au sein d'un même appel. Les propositions déjà écrites sont numérotées par date d'écriture.
