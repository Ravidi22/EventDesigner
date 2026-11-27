// `npm run check:scene`: the fixture (./fixture.ts) built by ./build.ts, asserted by hand. Its own
// file because the fixture primes the catalog, which nothing a page imports may do — build.ts is
// imported by the scene screens, this is imported by nobody.
//
// Each module also checks itself (check:envelope, check:tables, check:items, check:flowers,
// check:floor-kinds, check:overhead, check:stage). This one checks the WIRING: that the build hands
// every placement to the right builder, at the right height, and that the pieces agree — a chair
// on a banquette shares its geometry with the chairs round the tables, a vase on a banquette stands
// on its top, a chandelier hangs where its row says.
