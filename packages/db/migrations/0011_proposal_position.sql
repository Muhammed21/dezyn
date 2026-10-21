ALTER TABLE "proposal" ADD COLUMN "position" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "proposal_position_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
-- La base numérote chaque proposition à l'insertion : un lot se lit et se valide dans l'ordre d'écriture, y compris au sein d'un même appel.
