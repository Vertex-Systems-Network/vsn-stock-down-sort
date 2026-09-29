# Sorting behavior tests

Use these cases during development-store QA.

## Case 1 — mixed list

Input:

```text
A stock
B sold
C stock
D sold
E stock
```

Expected:

```text
A stock
C stock
E stock
B sold
D sold
```

## Case 2 — already sorted

Input:

```text
A stock
C stock
E stock
B sold
D sold
```

Expected: no reorder mutation.

## Case 3 — no sold-out products

Expected: no reorder mutation.

## Case 4 — all sold out

Expected: list relative order remains unchanged.

## Case 5 — untracked inventory

`tracksInventory=false` must remain in available group.

## Case 6 — >250 sold-out products

Expected: multiple reorder mutations, each <=250 moves.

## Case 7 — previous sort

Collection starts `BEST_SELLING`.
Enable => save `BEST_SELLING`, set `MANUAL`, sort.
Disable + restore => set `BEST_SELLING`.
