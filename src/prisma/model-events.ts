import { Logger } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/client'
import { Client } from 'pg'

// The json blobs that come directly from postgres don't get
// the Prisma transforms, so we need to "de-prismafy" the type
type DePrismafy<Model> = {
  [K in keyof Model]: Model[K] extends Date
    ? string
    : Model[K] extends Date | null
      ? string | null
      : Model[K]
}

type RowChangeModel<ModelName extends Prisma.ModelName> = DePrismafy<
  Awaited<
    ReturnType<PrismaClient[Uncapitalize<ModelName>]['findUniqueOrThrow']>
  >
>

export type RowChangeEvent<ModelName extends Prisma.ModelName> = {
  table: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  oldRow: RowChangeModel<ModelName> | null
  newRow: RowChangeModel<ModelName> | null
}

export const createModelEventTrigger = async (
  logger: Logger,
  client: Client,
  tables: string[],
) => {
  await client.query(`
-- Create a trigger function
CREATE OR REPLACE FUNCTION notify_row_changes() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'row_changed',
    json_build_object(
      'table', TG_TABLE_NAME,
      'action', TG_OP,
      'oldRow', row_to_json(OLD),
      'newRow', row_to_json(NEW)
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`)
  logger.log('Created trigger function')

  logger.log('Creating triggers for tables: ', tables)

  for (const table of tables) {
    await client.query(`
CREATE OR REPLACE TRIGGER ${table}_changes_trigger
AFTER INSERT OR UPDATE OR DELETE ON "${table}"
FOR EACH ROW EXECUTE FUNCTION notify_row_changes();
`)
    logger.log(`Created trigger for table: ${table}`)
  }

  await client.query('LISTEN row_changed')
}
