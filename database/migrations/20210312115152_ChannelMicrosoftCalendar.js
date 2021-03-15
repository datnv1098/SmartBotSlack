exports.up = function (knex) {
  return knex.schema.createTable('channel_microsoft_calendar', function (table) {
    table.string('id_channel')
      .references('id')
      .inTable('channel')
      .notNull();
    table.string('id_calendar')
      .references('id')
      .inTable('microsoft_calendar')
      .notNull();
    table.primary(['id_channel', 'id_calendar']);
    table.boolean('watch').notNullable().defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('channel_microsoft_calendar');
};
