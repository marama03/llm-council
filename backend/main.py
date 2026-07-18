"""FastAPI backend for LLM Council + Board of Directors."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import uuid
import json
import asyncio

from . import storage
from . import board_storage
from .council import (
    run_full_council,
    generate_conversation_title,
    stage1_collect_responses,
    stage2_collect_rankings,
    stage3_synthesize_final,
    calculate_aggregate_rankings,
)
from .boardroom import (
    convene_board,
    followup_turn,
    generate_board_title,
    stage1_blind_openings,
    stage2_cross_examination,
    stage3_revised_positions,
    stage4_chairman_consensus,
)
from .board_config import (
    COUNSEL_TYPES,
    AVAILABLE_MODELS,
    EXAMPLE_QUESTIONS,
    default_board,
    get_counsel_type,
)

app = FastAPI(title="LLM Council & Board of Directors API")

# Enable CORS for local development + sandbox preview
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------------------
# Shared models
# ----------------------------------------------------------------------------

class CreateConversationRequest(BaseModel):
    pass


class SendMessageRequest(BaseModel):
    content: str


class ConversationMetadata(BaseModel):
    id: str
    created_at: str
    title: str
    message_count: int


class Conversation(BaseModel):
    id: str
    created_at: str
    title: str
    messages: List[Dict[str, Any]]


# ----------------------------------------------------------------------------
# Health
# ----------------------------------------------------------------------------

@app.get("/")
async def root():
    return {"status": "ok", "service": "LLM Council & Board of Directors API"}


# ============================================================================
# CLASSIC COUNCIL (Karpathy's 3-stage: responses -> rankings -> synthesis)
# ============================================================================

@app.get("/api/conversations", response_model=List[ConversationMetadata])
async def list_conversations():
    return storage.list_conversations()


@app.post("/api/conversations", response_model=Conversation)
async def create_conversation(request: CreateConversationRequest):
    conversation_id = str(uuid.uuid4())
    return storage.create_conversation(conversation_id)


@app.get("/api/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.post("/api/conversations/{conversation_id}/message")
async def send_message(conversation_id: str, request: SendMessageRequest):
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    is_first_message = len(conversation["messages"]) == 0
    storage.add_user_message(conversation_id, request.content)

    if is_first_message:
        title = await generate_conversation_title(request.content)
        storage.update_conversation_title(conversation_id, title)

    stage1_results, stage2_results, stage3_result, metadata = await run_full_council(
        request.content
    )

    storage.add_assistant_message(
        conversation_id, stage1_results, stage2_results, stage3_result
    )

    return {
        "stage1": stage1_results,
        "stage2": stage2_results,
        "stage3": stage3_result,
        "metadata": metadata,
    }


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(conversation_id: str, request: SendMessageRequest):
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    is_first_message = len(conversation["messages"]) == 0

    async def event_generator():
        try:
            storage.add_user_message(conversation_id, request.content)
            title_task = None
            if is_first_message:
                title_task = asyncio.create_task(generate_conversation_title(request.content))

            yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
            stage1_results = await stage1_collect_responses(request.content)
            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': stage1_results})}\n\n"

            yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
            stage2_results, label_to_model = await stage2_collect_rankings(request.content, stage1_results)
            aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
            yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': {'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings}})}\n\n"

            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            stage3_result = await stage3_synthesize_final(request.content, stage1_results, stage2_results)
            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result})}\n\n"

            if title_task:
                title = await title_task
                storage.update_conversation_title(conversation_id, title)
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

            storage.add_assistant_message(
                conversation_id, stage1_results, stage2_results, stage3_result
            )
            yield f"data: {json.dumps({'type': 'complete'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ============================================================================
# BOARD OF DIRECTORS (Will's enhanced 4-stage boardroom)
# ============================================================================

class SeatConfig(BaseModel):
    seat: int
    role: str
    focus: str = ""
    persona: str
    model: str


class BoardConfig(BaseModel):
    counsel_type: str = "general"
    chairman_model: str
    chairman_persona: str = ""
    seats: List[SeatConfig]


class CreateBoardSessionRequest(BaseModel):
    counsel_type: str = "general"
    board: Optional[BoardConfig] = None


class ConveneRequest(BaseModel):
    question: str


class FollowupRequest(BaseModel):
    question: str


class BoardSessionMeta(BaseModel):
    id: str
    created_at: str
    title: str
    counsel_type: str
    turn_count: int


class BoardSession(BaseModel):
    id: str
    created_at: str
    title: str
    counsel_type: str
    board: Dict[str, Any]
    turns: List[Dict[str, Any]]


# --- Config endpoints ---

@app.get("/api/board/counsel-types")
async def get_counsel_types():
    """Return all counsel type presets (UI uses this to populate the selector)."""
    return {
        "counsel_types": [
            {
                "key": c["key"],
                "label": c["label"],
                "description": c["description"],
                "seats": [
                    {
                        "seat": i,
                        "role": s["role"],
                        "focus": s["focus"],
                        "persona": s["persona"],
                        "default_model": s["default_model"],
                    }
                    for i, s in enumerate(c["seats"])
                ],
                "chairman_persona": c["chairman_persona"],
            }
            for c in COUNSEL_TYPES.values()
        ]
    }


@app.get("/api/board/models")
async def get_available_models():
    """Return the list of models available to drop into any seat."""
    return {"models": AVAILABLE_MODELS}


@app.get("/api/board/examples")
async def get_example_questions():
    return {"examples": EXAMPLE_QUESTIONS}


# --- Session CRUD ---

@app.get("/api/board/sessions", response_model=List[BoardSessionMeta])
async def list_board_sessions():
    return board_storage.list_sessions()


@app.post("/api/board/sessions", response_model=BoardSession)
async def create_board_session(request: CreateBoardSessionRequest):
    session_id = str(uuid.uuid4())
    if request.board is not None:
        board = request.board.model_dump()
    else:
        board = default_board(request.counsel_type)
    return board_storage.create_session(session_id, request.counsel_type, board)


@app.get("/api/board/sessions/{session_id}", response_model=BoardSession)
async def get_board_session(session_id: str):
    session = board_storage.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Board session not found")
    return session


@app.delete("/api/board/sessions/{session_id}")
async def delete_board_session(session_id: str):
    deleted = board_storage.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Board session not found")
    return {"deleted": True}


@app.put("/api/board/sessions/{session_id}/board")
async def update_session_board(session_id: str, board: BoardConfig):
    session = board_storage.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Board session not found")
    board_storage.update_board(session_id, board.model_dump())
    return board_storage.get_session(session_id)


# --- Convene (full 4-stage, streaming) ---

@app.post("/api/board/sessions/{session_id}/convene/stream")
async def convene_board_stream(session_id: str, request: ConveneRequest):
    session = board_storage.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Board session not found")
    board = session["board"]
    question = request.question
    is_first_turn = len(session.get("turns", [])) == 0

    async def event_generator():
        try:
            # Kick off title generation in parallel for the first turn
            title_task = None
            if is_first_turn:
                title_task = asyncio.create_task(generate_board_title(question))

            counsel = get_counsel_type(board.get("counsel_type", "general"))

            # Stage 1: blind openings
            yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
            openings = await stage1_blind_openings(question, board, counsel)
            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': openings})}\n\n"

            # Stage 2: cross-examination
            yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
            cross = await stage2_cross_examination(question, openings, board, counsel)
            yield f"data: {json.dumps({'type': 'stage2_complete', 'data': cross})}\n\n"

            # Stage 3: revised positions
            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            revisions = await stage3_revised_positions(question, openings, cross, board, counsel)
            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': revisions})}\n\n"

            # Stage 4: chairman consensus
            yield f"data: {json.dumps({'type': 'stage4_start'})}\n\n"
            consensus = await stage4_chairman_consensus(question, openings, cross, revisions, board, counsel)
            yield f"data: {json.dumps({'type': 'stage4_complete', 'data': consensus})}\n\n"

            # Persist the turn
            turn = {
                "kind": "convene",
                "question": question,
                "stage1": openings,
                "stage2": cross,
                "stage3": revisions,
                "stage4": consensus,
            }
            board_storage.append_turn(session_id, turn)

            # Title
            if title_task is not None:
                title = await title_task
                board_storage.update_title(session_id, title)
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

            yield f"data: {json.dumps({'type': 'complete', 'data': {'turn_index': len(session.get('turns', []))}})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# --- Follow-up (re-convene the same board, streaming) ---

@app.post("/api/board/sessions/{session_id}/followup/stream")
async def followup_board_stream(session_id: str, request: FollowupRequest):
    session = board_storage.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Board session not found")
    board = session["board"]
    question = request.question
    prior_turns = session.get("turns", [])

    if not prior_turns:
        raise HTTPException(
            status_code=400,
            detail="Cannot follow up before the board has been convened at least once.",
        )

    async def event_generator():
        try:
            counsel = get_counsel_type(board.get("counsel_type", "general"))

            yield f"data: {json.dumps({'type': 'directors_start'})}\n\n"
            director_replies, consensus = await followup_turn(
                question, prior_turns, board, counsel
            )
            yield f"data: {json.dumps({'type': 'directors_complete', 'data': director_replies})}\n\n"

            yield f"data: {json.dumps({'type': 'chairman_start'})}\n\n"
            yield f"data: {json.dumps({'type': 'chairman_complete', 'data': consensus})}\n\n"

            turn = {
                "kind": "followup",
                "question": question,
                "directors": director_replies,
                "chairman": consensus,
            }
            board_storage.append_turn(session_id, turn)

            yield f"data: {json.dumps({'type': 'complete', 'data': {'turn_index': len(prior_turns)}})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
