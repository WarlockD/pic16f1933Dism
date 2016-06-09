﻿using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;


namespace pic16f19x.FlowAnalysis
{
    /// <summary>
	/// Type of the control flow node
	/// </summary>
	public enum ControlFlowNodeType
    {
        /// <summary>
        /// A normal node represents a basic block.
        /// </summary>
        Normal,
        /// <summary>
        /// The entry point of the method.
        /// </summary>
        EntryPoint,
        /// <summary>
        /// The exit point of the method (every ret instruction branches to this node)
        /// This could also be a jump outside of the current function
        /// </summary>
        RegularExit,
    }

    /// <summary>
    /// Represents a block in the control flow graph.
    /// </summary>
    public sealed class ControlFlowNode
    {
        /// <summary>
        /// Index of this node in the ControlFlowGraph.Nodes collection.
        /// </summary>
        public readonly int BlockIndex;
        public List<ControlFlowNode> PopEnvNodes;
        /// <summary>
        /// Gets the IL offset of this node.
        /// </summary>
        public readonly int Offset;

        /// <summary>
        /// Type of the node.
        /// </summary>
        public readonly ControlFlowNodeType NodeType;



        /// <summary>
        /// Visited flag, used in various algorithms.
        /// Before using it in your algorithm, reset it to false by calling ControlFlowGraph.ResetVisited();
        /// </summary>
        public bool Visited;

        /// <summary>
        /// Gets whether this node is reachable. Requires that dominance is computed!
        /// </summary>
        public bool IsReachable
        {
            get { return ImmediateDominator != null || NodeType == ControlFlowNodeType.EntryPoint; }
        }

        /// <summary>
        /// Signalizes that this node is a copy of another node.
        /// </summary>
        public ControlFlowNode CopyFrom { get; internal set; }

        /// <summary>
        /// Gets the immediate dominator (the parent in the dominator tree).
        /// Null if dominance has not been calculated; or if the node is unreachable.
        /// </summary>
        public ControlFlowNode ImmediateDominator { get; internal set; }

        /// <summary>
        /// List of children in the dominator tree.
        /// </summary>
        public readonly List<ControlFlowNode> DominatorTreeChildren = new List<ControlFlowNode>();

        /// <summary>
        /// The dominance frontier of this node.
        /// This is the set of nodes for which this node dominates a predecessor, but which are not strictly dominated by this node.
        /// </summary>
        /// <remarks>
        /// b.DominanceFrontier = { y in CFG; (exists p in predecessors(y): b dominates p) and not (b strictly dominates y)}
        /// </remarks>
        public HashSet<ControlFlowNode> DominanceFrontier;

        /// <summary>
        /// Start of code block represented by this node. Only set for nodetype == Normal.
        /// </summary>
        public LinkedListNode<Instruction> Start;

        /// <summary>
        /// End of the code block represented by this node. Only set for nodetype == Normal.
        /// The end is exclusive, the end instruction itself does not belong to this block.
        /// </summary>
        public LinkedListNode<Instruction> End;


        /// <summary>
        /// List of incoming control flow edges.
        /// </summary>
        public readonly List<ControlFlowEdge> Incoming = new List<ControlFlowEdge>();

        /// <summary>
        /// List of outgoing control flow edges.
        /// </summary>
        public readonly List<ControlFlowEdge> Outgoing = new List<ControlFlowEdge>();

        /// <summary>
        /// Any user data
        /// </summary>
        public object UserData;

        internal ControlFlowNode(int blockIndex, int offset, ControlFlowNodeType nodeType)
        {
            this.BlockIndex = blockIndex;
            this.Offset = offset;
            this.NodeType = nodeType;
            this.Start = this.End = null;
        }

        internal ControlFlowNode(int blockIndex, LinkedListNode<Instruction> start, LinkedListNode<Instruction> end)
        {
            if (start == null)
                throw new ArgumentNullException("start");
            if (end == null)
                throw new ArgumentNullException("end");
            this.BlockIndex = blockIndex;
            this.NodeType = ControlFlowNodeType.Normal;
            this.Start = start;
            this.End = end;
            this.Offset = start.Value.Address;
        }


        /// <summary>
        /// Gets all predecessors (=sources of incoming edges)
        /// </summary>
        public IEnumerable<ControlFlowNode> Predecessors
        {
            get
            {
                return Incoming.Select(e => e.Source);
            }
        }

        /// <summary>
        /// Gets all successors (=targets of outgoing edges)
        /// </summary>
        public IEnumerable<ControlFlowNode> Successors
        {
            get
            {
                return Outgoing.Select(e => e.Target);
            }
        }

        /// <summary>
        /// Gets all instructions in this node.
        /// Returns an empty list for special nodes that don't have any instructions.
        /// </summary>
        public IEnumerable<Instruction> Instructions
        {
            get
            {
                LinkedListNode<Instruction> inst = Start;
                if (inst != null)
                {
                    yield return inst.Value;
                    while (inst != End)
                    {
                        inst = inst.Next;
                        yield return inst.Value;
                    }
                }
            }
        }

        public void TraversePreOrder(Func<ControlFlowNode, IEnumerable<ControlFlowNode>> children, Action<ControlFlowNode> visitAction)
        {
            if (Visited)
                return;
            Visited = true;
            visitAction(this);
            foreach (ControlFlowNode t in children(this))
                t.TraversePreOrder(children, visitAction);
        }

        public void TraversePostOrder(Func<ControlFlowNode, IEnumerable<ControlFlowNode>> children, Action<ControlFlowNode> visitAction)
        {
            if (Visited)
                return;
            Visited = true;
            foreach (ControlFlowNode t in children(this))
                t.TraversePostOrder(children, visitAction);
            visitAction(this);
        }

        public override string ToString()
        {
            StringWriter writer = new StringWriter();
            switch (NodeType)
            {
                case ControlFlowNodeType.Normal:
                    writer.Write("Block #{0}", BlockIndex);
                    if (Start != null)
                        writer.Write(": GM_{0,-4}", Start.Value.Address);
                    if (End != null)
                        writer.Write(" to GM_{0,-4}", End.Value.Address);
                    break;
                default:
                    writer.Write("Block #{0}: {1}", BlockIndex, NodeType);
                    break;
            }
            //			if (ImmediateDominator != null) {
            //				writer.WriteLine();
            //				writer.Write("ImmediateDominator: #{0}", ImmediateDominator.BlockIndex);
            //			}
            if (DominanceFrontier != null && DominanceFrontier.Any())
            {
                writer.WriteLine();
                writer.Write("DominanceFrontier: " + string.Join(",", DominanceFrontier.OrderBy(d => d.BlockIndex).Select(d => d.BlockIndex.ToString())));
            }
            foreach (Instruction inst in this.Instructions)
            {
                writer.WriteLine();
                writer.Write(inst.ToString());
                // Disassembler.DisassemblerHelpers.WriteTo(inst, new PlainTextOutput(writer));
            }
           
            if (UserData != null)
            {
                writer.WriteLine();
                writer.Write(UserData.ToString());
            }
            return writer.ToString();
        }

        /// <summary>
        /// Gets whether <c>this</c> dominates <paramref name="node"/>.
        /// </summary>
        public bool Dominates(ControlFlowNode node)
        {
            // TODO: this can be made O(1) by numbering the dominator tree
            ControlFlowNode tmp = node;
            while (tmp != null)
            {
                if (tmp == this)
                    return true;
                tmp = tmp.ImmediateDominator;
            }
            return false;
        }
    }
}
