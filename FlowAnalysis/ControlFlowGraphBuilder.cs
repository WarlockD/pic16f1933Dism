using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;


namespace pic16f19x.FlowAnalysis
{

	/// <summary>
	/// Constructs the Control Flow Graph from a Cecil method body.
	/// </summary>
	public sealed class ControlFlowGraphBuilder
    {
        public static ControlFlowGraph Build(List<Instruction> methodBody)
        {
            return new ControlFlowGraphBuilder(methodBody).Build();
        }

        // This option controls how finally blocks are handled:
        // false means that the endfinally instruction will jump to any of the leave targets (EndFinally edge type).
        // true means that a copy of the whole finally block is created for each leave target. In this case, each endfinally node will be connected with the leave
        //   target using a normal edge.


        List<Instruction> instructions;
        LinkedList<Instruction> linked_instructions;
        ushort[] offsets; // array index = instruction index; value = IL offset
        bool[] hasIncomingJumps; // array index = instruction index
        List<ControlFlowNode> nodes = new List<ControlFlowNode>();
        ControlFlowNode entryPoint;
        ControlFlowNode regularExit;

        private ControlFlowGraphBuilder(List<Instruction> instructions)
        {
            this.instructions = instructions;
            this.linked_instructions = new LinkedList<Instruction>(instructions);
            offsets = instructions.Select(i => i.Address).ToArray();
            hasIncomingJumps = new bool[instructions.Count];

            entryPoint = new ControlFlowNode(0, 0, ControlFlowNodeType.EntryPoint);
            nodes.Add(entryPoint);
            regularExit = new ControlFlowNode(1, -1, ControlFlowNodeType.RegularExit);
            nodes.Add(regularExit);
            Debug.Assert(nodes.Count == 2);
        }

        /// <summary>
        /// Determines the index of the instruction (for use with the hasIncomingJumps array)
        /// </summary>
        int GetInstructionIndex(Instruction inst)
        {
            int index = Array.BinarySearch(offsets, inst.Address);
            Debug.Assert(index >= 0);
            return index;
        }
        int GetInstructionIndex(Label label)
        {
            int index = Array.BinarySearch(offsets, label.Address);
            Debug.Assert(index >= 0);
            return index;
        }
        /// <summary>
        /// Builds the ControlFlowGraph.
        /// </summary>
        public ControlFlowGraph Build()
        {
            CalculateHasIncomingJumps();
            CreateNodes();
            CreateRegularControlFlow();
            /*
            CreateExceptionalControlFlow();
            if (copyFinallyBlocks)
                CopyFinallyBlocksIntoLeaveEdges();
            else
                TransformLeaveEdges();
                */
            return new ControlFlowGraph(nodes.ToArray());
        }

        #region Step 1: calculate which instructions are the targets of jump instructions.
        void CalculateHasIncomingJumps()
        {
            foreach (Instruction inst in instructions)
            {
                if(inst.Label != null) hasIncomingJumps[GetInstructionIndex(inst.Label)] = true;
                else if(inst.BranchLabel != null) hasIncomingJumps[GetInstructionIndex(inst.BranchLabel)] = true;
            }
        }
        #endregion

        #region Step 2: create nodes
        public bool isExitFlow(Instruction i)
        {
            switch (i.Opcode)
            {
                case Opcode.CALL:
                case Opcode.BRA:
                case Opcode.BRW:
                case Opcode.GOTO:
                case Opcode.RETLW:
                case Opcode.RESET:
                case Opcode.SLEEP:
                case Opcode.RETFIE:
                    return true;
                default:
                    return false;
            }
        }
        void CreateNodes()
        {
            // Step 2a: find basic blocks and create nodes for them
            var blockStart = linked_instructions.First;
            while (blockStart != null)
            {
                var blockEnd = blockStart;
                while (blockEnd.Next != null)
                {
                    Instruction inst = blockEnd.Value;
                    if (isExitFlow(inst)) break;
                    if (blockEnd.Next != null && blockEnd.Next.Value.Label != null) break; // if next is a label
                    blockEnd = blockEnd.Next;
                }
                var node = new ControlFlowNode(nodes.Count, blockStart, blockEnd);
                nodes.Add(node);
                blockStart = blockEnd.Next;
            }
        }
        #endregion

        #region Step 3: create edges for the normal flow of control (assuming no exceptions thrown)
        void NextInstructionEdge(ControlFlowNode node)
        {
            Instruction inst = node.End.Value;
            switch (inst.Opcode)
            {
                case Opcode.RESET:

                case Opcode.SLEEP:
                    CreateEdge(node, regularExit, JumpType.Normal);
                    break;
                default:
                    CreateEdge(node, node.End.Next.Value, JumpType.Normal);
                    break;
            }
        }
        void SwitchDetection(ControlFlowNode node, LinkedListNode<Instruction> start)
        {
            var current = start;
            while (current != null)
            {
                switch (current.Value.Opcode)
                {
                    case Opcode.BRA:
                    case Opcode.GOTO:
                    case Opcode.CALL:
                        CreateEdge(node, current.Value.BranchLabel, JumpType.Normal);
                        node.End = current; // set the ending to the next branch
                        break;
                    default:
                        break;
                }
                current = current.Next;
            }
        }
        void CreateRegularControlFlow()
        {
            CreateEdge(entryPoint, instructions[0], JumpType.Normal);
            foreach (var n in nodes) n.Visited = false;
            foreach (ControlFlowNode node in nodes)
            {
                if (node.Visited) continue; // skip
                node.Visited = true;
                //Debug.Assert(node.BlockIndex != 93);
                if (node.End != null)
                {
                    Instruction inst = node.End.Value;
                    switch (inst.Opcode)
                    {
                        case Opcode.RETFIE:
                        case Opcode.RETLW:
                        case Opcode.RETURN:
                            break;
                            // no edge node
                        case Opcode.GOTO:
                        case Opcode.BRA:
                            CreateEdge(node, inst.BranchLabel, JumpType.Normal);
                            if(node.End.Previous.Value.isSkip) NextInstructionEdge(node); // we come back from a call
                            break;
                        case Opcode.CALL:
                            CreateEdge(node, inst.BranchLabel, JumpType.Normal);
                            NextInstructionEdge(node); // we come back from a call
                            break;
                        case Opcode.BRW:
                            SwitchDetection(node, node.End.Next);
                            break;
                        default:
                            NextInstructionEdge(node);
                            break;
                    }
                }
            }
        }
        #endregion

 

        /// <summary>
        /// Creates a copy of all nodes pointing to 'end' and replaces those references with references to 'newEnd'.
        /// Nodes pointing to the copied node are copied recursively to update those references, too.
        /// This recursion stops at 'start'. The modified version of start is returned.
        /// </summary>
        ControlFlowNode CopyFinallySubGraph(ControlFlowNode start, ControlFlowNode end, ControlFlowNode newEnd)
        {
            return new CopyFinallySubGraphLogic(this, start, end, newEnd).CopyFinallySubGraph();
        }

        class CopyFinallySubGraphLogic
        {
            readonly ControlFlowGraphBuilder builder;
            readonly Dictionary<ControlFlowNode, ControlFlowNode> oldToNew = new Dictionary<ControlFlowNode, ControlFlowNode>();
            readonly ControlFlowNode start;
            readonly ControlFlowNode end;
            readonly ControlFlowNode newEnd;

            public CopyFinallySubGraphLogic(ControlFlowGraphBuilder builder, ControlFlowNode start, ControlFlowNode end, ControlFlowNode newEnd)
            {
                this.builder = builder;
                this.start = start;
                this.end = end;
                this.newEnd = newEnd;
            }

            internal ControlFlowNode CopyFinallySubGraph()
            {
                foreach (ControlFlowNode n in end.Predecessors)
                {
                    CollectNodes(n);
                }
                foreach (var pair in oldToNew)
                    ReconstructEdges(pair.Key, pair.Value);
                return GetNew(start);
            }

            void CollectNodes(ControlFlowNode node)
            {
                if (node == end || node == newEnd)
                    throw new InvalidOperationException("unexpected cycle involving finally construct");
                if (!oldToNew.ContainsKey(node))
                {
                    int newBlockIndex = builder.nodes.Count;
                    ControlFlowNode copy;
                    switch (node.NodeType)
                    {
                        case ControlFlowNodeType.Normal:
                            copy = new ControlFlowNode(newBlockIndex, node.Start, node.End);
                            break;
                    //    case ControlFlowNodeType.FinallyOrFaultHandler:
                    //        copy = new ControlFlowNode(newBlockIndex, node.ExceptionHandler, node.EndFinallyOrFaultNode);
                     //       break;
                        default:
                            // other nodes shouldn't occur when copying finally blocks
                            throw new NotSupportedException(node.NodeType.ToString());
                    }
                    copy.CopyFrom = node;
                    builder.nodes.Add(copy);
                    oldToNew.Add(node, copy);

                    if (node != start)
                    {
                        foreach (ControlFlowNode n in node.Predecessors)
                        {
                            CollectNodes(n);
                        }
                    }
                }
            }

            void ReconstructEdges(ControlFlowNode oldNode, ControlFlowNode newNode)
            {
                foreach (ControlFlowEdge oldEdge in oldNode.Outgoing)
                {
                    builder.CreateEdge(newNode, GetNew(oldEdge.Target), oldEdge.Type);
                }
            }

            ControlFlowNode GetNew(ControlFlowNode oldNode)
            {
                if (oldNode == end)
                    return newEnd;
                ControlFlowNode newNode;
                if (oldToNew.TryGetValue(oldNode, out newNode))
                    return newNode;
                return oldNode;
            }
        }

        #region CreateEdge methods
        void CreateEdge(ControlFlowNode fromNode, Instruction toInstruction, JumpType type)
        {
            CreateEdge(fromNode, nodes.Single(n => n.Start != null && n.Start.Value == toInstruction), type);
        }
        void CreateEdge(ControlFlowNode fromNode, Label toLabel, JumpType type)
        {
            CreateEdge(fromNode, nodes.Single(n => n.Start != null && n.Start.Value.Address == toLabel.Address), type);
        }
        void CreateEdge(ControlFlowNode fromNode, ControlFlowNode toNode, JumpType type)
        {
            ControlFlowEdge edge = new ControlFlowEdge(fromNode, toNode, type);
            fromNode.Outgoing.Add(edge);
            toNode.Incoming.Add(edge);
        }
        #endregion

        #region OpCode info

 
        #endregion
    }
}
