exports.up = function (knex) {
  return knex.schema.table('google_account', function (table) {
    table.string('mail').notNull().after('id');
  });
};

exports.down = function (knex) {
  return knex.schema.table('google_account', table => {
    table.dropColumn('mail');
  })
};
