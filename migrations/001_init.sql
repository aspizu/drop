create table if not exists share (
    id text primary key,
    expires_at text not null,
    passwd text not null,
    metadata text not null default '{}',
    anyone_can_write boolean not null default false

) strict, without rowid;

create table if not exists blob (
    id primary key,
    share_id text not null,
    bsize integer not null,
    is_uploaded boolean not null default false,
    metadata text not null default '{}',
    foreign key (share_id) references share (id)
) strict, without rowid;
