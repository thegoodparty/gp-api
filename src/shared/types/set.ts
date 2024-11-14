// While Set.prototype.intersection and Set.prototype.difference are
//  indeed supported by Node 22+, apparently TS hasn't updated its Set
//  type definition to include these methods yet. So we need to do this for now.
interface Set<T> {
  intersection(other: Set<T>): Set<T>
  difference(other: Set<T>): Set<T>
}
