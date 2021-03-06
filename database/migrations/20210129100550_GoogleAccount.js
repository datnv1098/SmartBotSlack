exports.up = function (knex) {
  return knex.schema.createTable('google_account', function (table) {
    table.string('id').primary().notNull();
    table.string('name').notNull();
    table.text('refresh_token').notNull();
    table.string('timezone').notNull();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('google_account');
};
