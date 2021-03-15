exports.up = function (knex) {
  return knex.schema.createTable('channel_microsoft_account', function (table) {
    table.string('id_channel')
      .references('id')
      .inTable('channel')
      .notNull();
    table.string('id_account')
      .references('id')
      .inTable('microsoft_account')
      .notNull();
    table.primary(['id_channel', 'id_account']);
    table.timestamp('created_at')
      .defaultTo(knex.fn.now());
    table.timestamp('updated_at')
      .defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('channel_microsoft_account');
};
