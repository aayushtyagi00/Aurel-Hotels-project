export const roles=['manager','receptionist','housekeeping','maintenance','viewer'] as const;
export type Role='owner'|typeof roles[number];
export type Permission='bookings.read'|'bookings.write'|'rooms.read'|'rooms.write'|'cleaning.write'|'maintenance.write'|'tasks.read'|'tasks.write'|'payments.read'|'payments.write'|'staff.write'|'audit.read';
const all:Permission[]=['bookings.read','bookings.write','rooms.read','rooms.write','cleaning.write','maintenance.write','tasks.read','tasks.write','payments.read','payments.write','staff.write','audit.read'];
export const permissions:Record<Role,Permission[]>={
owner:all,manager:all.filter(p=>p!=='staff.write'),
receptionist:['bookings.read','bookings.write','rooms.read','tasks.read','tasks.write','payments.read','payments.write'],
housekeeping:['rooms.read','cleaning.write','tasks.read','tasks.write'],
maintenance:['rooms.read','maintenance.write','tasks.read','tasks.write'],
viewer:['bookings.read','rooms.read','tasks.read','payments.read']};
export const can=(role:Role|null|undefined,permission:Permission)=>!!role&&permissions[role]?.includes(permission);
export const roleDetails:Record<Role,string>={owner:'Full hotel control, staff access and activity history.',manager:'Reservations, rooms, cleaning, maintenance, payments and reports.',receptionist:'Reservations, guest check-in/out, tasks and payment recording.',housekeeping:'Room cleaning status and housekeeping tasks. No guest or payment data.',maintenance:'Room maintenance status and maintenance tasks. No guest or payment data.',viewer:'Read-only reservations, rooms, tasks and payment reports.'};