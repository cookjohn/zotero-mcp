import argparse
import base64
import glob
import json
import os
import subprocess
import sys
import time
import uuid
from typing import Any, Dict, List, Optional

try:
    import requests
except Exception:
    requests = None

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
try:
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("PYTHONUTF8", "1")


# =============================================================================
# Host IP Detection (for Docker containers)
# =============================================================================

def _get_host_ip_from_env() -> Optional[str]:
    """Check if HOST_IP is explicitly set."""
    return os.environ.get("HOST_IP") or os.environ.get("HOST")


def _get_host_ip_from_docker_host() -> Optional[str]:
    """Parse IP from DOCKER_HOST environment variable."""
    import re
    docker_host = os.environ.get("DOCKER_HOST", "")
    if not docker_host:
        return None
    match = re.search(r'tcp://([^:]+):', docker_host)
    return match.group(1) if match else None


def _get_host_ip_from_gateway() -> Optional[str]:
    """Get default gateway IP (Linux containers)."""
    import re
    try:
        # Read from /proc/net/route
        with open("/proc/net/route", "r") as f:
            for line in f.readlines():
                fields = line.strip().split()
                if len(fields) >= 3 and fields[1] == "00000000":
                    gateway_hex = fields[2]
                    # Convert hex IP to dotted decimal (little endian)
                    return ".".join(str(int(gateway_hex[i:i+2], 16)) for i in (6, 4, 2, 0))
    except (FileNotFoundError, PermissionError, ValueError):
        pass
    
    # Fallback: try ip route command
    try:
        result = subprocess.run(["ip", "route"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            match = re.search(r'default via ([\d.]+)', result.stdout)
            if match:
                return match.group(1)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def _get_host_ip_from_etc_hosts() -> Optional[str]:
    """Parse /etc/hosts for host entries."""
    import re
    try:
        with open("/etc/hosts", "r") as f:
            content = f.read()
        # Look for host.docker.internal
        match = re.search(r'([\d.]+)\s+host\.docker\.internal', content)
        if match:
            return match.group(1)
    except (FileNotFoundError, PermissionError):
        pass
    return None


def _get_host_ip_from_hostname() -> Optional[str]:
    """Try hostname command."""
    try:
        result = subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            ips = result.stdout.strip().split()
            # Prefer private IPs
            for ip in ips:
                if ip.startswith(("192.168.", "10.", "172.")):
                    return ip
            return ips[0] if ips else None
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def _validate_ip(ip: Optional[str]) -> bool:
    """Validate IPv4 address."""
    if not ip or ip in ("127.0.0.1", "0.0.0.0", "localhost"):
        return False
    parts = ip.split(".")
    if len(parts) != 4:
        return False
    try:
        return all(0 <= int(p) <= 255 for p in parts)
    except ValueError:
        return False


def _get_host_ip() -> str:
    """Determine host IP using multiple methods."""
    # Already set?
    host = _get_host_ip_from_env()
    if _validate_ip(host):
        return host
    
    # Try detection methods
    methods = [
        _get_host_ip_from_docker_host,
        _get_host_ip_from_gateway,
        _get_host_ip_from_etc_hosts,
        _get_host_ip_from_hostname,
    ]
    
    for method in methods:
        try:
            ip = method()
            if _validate_ip(ip):
                os.environ["HOST"] = ip
                return ip
        except Exception:
            pass
    
    # Fallback
    return "host.docker.internal"


# Auto-detect host on module load
HOST = _get_host_ip()
os.environ.setdefault("HOST", HOST)


def _normalize_pick_tokens(picks: Optional[List[str]]) -> List[str]:
    if not picks:
        return []
    out: List[str] = []
    for item in picks:
        parts = [p.strip() for p in item.split(",") if p.strip()]
        out.extend(parts)
    return out


def _pick_from_directory(directory: str, pick_tokens: List[str], recursive: bool) -> List[str]:
    if not pick_tokens:
        return []

    all_pdfs = glob.glob(os.path.join(directory, "**/*.pdf" if recursive else "*.pdf"), recursive=recursive)
    by_abs = {os.path.abspath(p): os.path.abspath(p) for p in all_pdfs}

    by_base: dict[str, List[str]] = {}
    for p in all_pdfs:
        by_base.setdefault(os.path.basename(p).lower(), []).append(os.path.abspath(p))

    selected: List[str] = []
    for token in pick_tokens:
        t = token.strip().strip('"').strip("'")
        if not t:
            continue

        if os.path.isabs(t):
            ap = os.path.abspath(t)
            if ap in by_abs:
                selected.append(ap)
                continue

        ap2 = os.path.abspath(os.path.join(directory, t))
        if ap2 in by_abs:
            selected.append(ap2)
            continue

        base_key = os.path.basename(t).lower()
        matched = by_base.get(base_key, [])
        if len(matched) == 1:
            selected.append(matched[0])
        elif len(matched) > 1:
            raise RuntimeError(f"ambiguous pick token: {token} (matched {len(matched)} files)")
        else:
            raise FileNotFoundError(f"pick file not found in dir: {token}")

    return selected


def gather_pdfs(pdf_list: Optional[List[str]], directory: Optional[str], recursive: bool, pick_tokens: Optional[List[str]] = None) -> List[str]:
    files: List[str] = []
    if pdf_list:
        files.extend(pdf_list)
    if directory:
        if pick_tokens:
            files.extend(_pick_from_directory(directory, pick_tokens, recursive=recursive))
        else:
            pattern = "**/*.pdf" if recursive else "*.pdf"
            files.extend(glob.glob(os.path.join(directory, pattern), recursive=recursive))

    seen = set()
    out: List[str] = []
    for f in files:
        af = os.path.abspath(f)
        if af not in seen:
            seen.add(af)
            out.append(af)
    return out


# =============================================================================
# MCP Client Functions (New - zotero-mcp integration)
# =============================================================================

class ZoteroMCPClient:
    """Client for Zotero MCP Server (zotero-mcp plugin)"""

    def __init__(self, port: int = 23120, timeout: int = 30):
        self.port = port
        self.timeout = timeout
        self.host = os.environ.get("HOST", "host.docker.internal")
        self.base_url = f"http://{self.host}:{port}/mcp"
        if requests is None:
            raise RuntimeError("requests not installed; run: python -m pip install requests")
    
    def _request_id(self) -> int:
        """Generate unique request ID"""
        import time
        return int(time.time() * 1000) % 1000000

    def _call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call an MCP tool via HTTP POST using proper JSON-RPC format"""
        # Use proper JSON-RPC 2.0 format as verified by test_mcp_server.py
        payload = {
            "jsonrpc": "2.0",
            "id": self._request_id(),
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }
        try:
            print(f"debug=_call_tool_url={self.base_url}")
            print(f"debug=_call_tool_name={tool_name}")
            r = requests.post(
                self.base_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                timeout=self.timeout
            )
            print(f"debug=http_status={r.status_code}")
            r.raise_for_status()
            response = r.json()
            print(f"debug=response_keys={list(response.keys())}")

            # Extract result from JSON-RPC response
            if "error" in response:
                raise RuntimeError(f"MCP error: {response['error']}")

            result = response.get("result", {})

            # MCP wraps results in content format, extract the actual data
            if "content" in result and isinstance(result["content"], list):
                # Get first content item's text
                content_text = result["content"][0].get("text", "")
                if content_text:
                    try:
                        return json.loads(content_text)
                    except json.JSONDecodeError:
                        return {"text": content_text}

            # Return raw result if not in content format
            return result
        except requests.exceptions.ConnectionError as e:
            raise RuntimeError(f"Cannot connect to MCP server at {self.base_url}. "
                             f"Ensure zotero-mcp plugin is installed and MCP server is enabled.") from e
        except requests.exceptions.Timeout as e:
            raise RuntimeError(f"MCP server request timed out after {self.timeout}s") from e
    
    # Search & Query Tools (tool names must be lowercase as per MCP spec)
    def search_library(self, query: str, mode: str = "title,creator,year,tags,fulltext",
                       limit: int = 20) -> Dict[str, Any]:
        return self._call_tool("search_library", {
            "q": query,
            "mode": mode,
            "limit": limit
        })

    def search_annotations(self, query: str, color: Optional[str] = None,
                          tags: Optional[List[str]] = None, limit: int = 20) -> Dict[str, Any]:
        args = {"q": query, "limit": limit}
        if color:
            args["color"] = color
        if tags:
            args["tags"] = tags
        return self._call_tool("search_annotations", args)

    def search_fulltext(self, query: str, limit: int = 20) -> Dict[str, Any]:
        return self._call_tool("search_fulltext", {"q": query, "limit": limit})

    def get_item_details(self, item_key: str) -> Dict[str, Any]:
        return self._call_tool("get_item_details", {"itemKey": item_key})

    def get_item_abstract(self, item_key: str, format: str = "text") -> Dict[str, Any]:
        return self._call_tool("get_item_abstract", {"itemKey": item_key, "format": format})

    def get_content(self, item_key: str, mode: str = "standard") -> Dict[str, Any]:
        return self._call_tool("get_content", {"itemKey": item_key, "mode": mode})

    # Collection Management Tools
    def get_collections(self, limit: int = 1000) -> Dict[str, Any]:
        return self._call_tool("get_collections", {"limit": limit})

    def get_collection_details(self, collection_key: str) -> Dict[str, Any]:
        return self._call_tool("get_collection_details", {"collectionKey": collection_key})

    def get_collection_items(self, collection_key: str, limit: int = 50) -> Dict[str, Any]:
        return self._call_tool("get_collection_items", {
            "collectionKey": collection_key,
            "limit": limit
        })

    def get_subcollections(self, collection_key: str, recursive: bool = False) -> Dict[str, Any]:
        return self._call_tool("get_subcollections", {
            "collectionKey": collection_key,
            "recursive": recursive
        })

    # Semantic Search Tools
    def semantic_search(self, query: str, limit: int = 10) -> Dict[str, Any]:
        return self._call_tool("semantic_search", {"query": query, "limit": limit})

    def find_similar(self, item_key: str, limit: int = 10) -> Dict[str, Any]:
        return self._call_tool("find_similar", {"itemKey": item_key, "limit": limit})

    def semantic_status(self) -> Dict[str, Any]:
        return self._call_tool("semantic_status", {})

    # Full-text Database Tools
    def fulltext_database(self, action: str, item_key: Optional[str] = None,
                         query: Optional[str] = None, limit: int = 20) -> Dict[str, Any]:
        args = {"action": action, "limit": limit}
        if item_key:
            args["itemKey"] = item_key
        if query:
            args["query"] = query
        return self._call_tool("fulltext_database", args)

    # Write Operations Tools
    def write_note(self, item_key: str, note: str) -> Dict[str, Any]:
        return self._call_tool("write_note", {"parentKey": item_key, "content": note, "action": "create"})

    def write_tag(self, item_key: str, tags: List[str], operation: str = "add") -> Dict[str, Any]:
        return self._call_tool("write_tag", {
            "itemKey": item_key,
            "tags": tags,
            "action": operation
        })

    def write_metadata(self, item_key: str, **metadata) -> Dict[str, Any]:
        args = {"itemKey": item_key, "fields": metadata}
        return self._call_tool("write_metadata", args)

    def write_item(self, item_type: str, **properties) -> Dict[str, Any]:
        args = {"action": "create", "itemType": item_type, **properties}
        return self._call_tool("write_item", args)
    
    def ping(self) -> bool:
        """Check if MCP server is available by calling tools/list"""
        try:
            payload = {
                "jsonrpc": "2.0",
                "id": self._request_id(),
                "method": "tools/list",
            }
            r = requests.post(
                self.base_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                timeout=5
            )
            return r.status_code == 200
        except Exception:
            return False

    # Zotero Local Connector Proxy Methods (port 23119)
    def connector_health(self, port: int = 23119) -> Dict[str, Any]:
        """Check Zotero Local Connector health via MCP proxy"""
        return self._call_tool("connector_health", {"port": port})

    def list_available_tools(self) -> Dict[str, Any]:
        """List all available MCP tools for debugging"""
        try:
            payload = {
                "jsonrpc": "2.0",
                "id": self._request_id(),
                "method": "tools/list",
            }
            r = requests.post(
                self.base_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                timeout=self.timeout
            )
            r.raise_for_status()
            response = r.json()
            if "result" in response and "tools" in response["result"]:
                return response["result"]["tools"]
            return []
        except Exception as e:
            return {"error": str(e)}

    def import_pdf(self, pdf_path: str, collection: Optional[str] = None) -> Dict[str, Any]:
        """Import PDF via Zotero Local Connector via MCP proxy

        Flow:
            1. Read PDF file and encode as base64
            2. Call import_pdf with pdf_content
            3. Server saves to temp and imports via Zotero Local Connector (port 23119)

        Args:
            pdf_path: Path to the PDF file in the container
            collection: Target collection name (optional)
        """
        if not os.path.exists(pdf_path):
            return {
                "success": False,
                "error": f"PDF file not found: {pdf_path}"
            }

        try:
            with open(pdf_path, "rb") as f:
                pdf_content = base64.b64encode(f.read()).decode("utf-8")
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to read PDF: {e}"
            }

        args = {
            "pdf_content": pdf_content,
            "pdf_filename": os.path.basename(pdf_path)
        }
        if collection:
            args["collection"] = collection
        return self._call_tool("import_pdf", args)


# =============================================================================
# Command Handlers
# =============================================================================

def cmd_import(args: argparse.Namespace) -> int:
    """Import PDFs via MCP proxy (port 23120)"""
    picks = _normalize_pick_tokens(args.pick)
    pdfs = gather_pdfs(args.pdf, args.dir, args.recursive, pick_tokens=picks)
    if not pdfs:
        print("error=no PDF files found")
        return 4

    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
    except Exception as e:
        print(f"error=failed to create MCP client: {e}")
        return 20

    # Print connection info for debugging
    print(f"debug=mcp_server=http://{client.host}:{client.port}/mcp")
    print(f"debug=pdfs_to_import={len(pdfs)}")

    ok = 0
    fail = 0
    for p in pdfs:
        print(f"debug=importing={p}")
        try:
            result = client.import_pdf(
                pdf_path=p,
                collection=args.collection
            )
            print(f"debug=raw_result={json.dumps(result, indent=2)[:500]}")
            if result.get("success"):
                ok += 1
                print(f"ok={p}")
            else:
                fail += 1
                print(f"fail={p} error={result.get('message', result.get('error', 'unknown error'))}")
                if result.get("error"):
                    print(f"debug=error_detail={result.get('error')}")
                if result.get("message"):
                    print(f"debug=message_detail={result.get('message')}")
        except Exception as e:
            fail += 1
            print(f"fail={p} error={e}")
            import traceback
            print(f"debug=traceback={traceback.format_exc()}")

    print(f"summary=ok:{ok} fail:{fail} total:{len(pdfs)}")
    return 0 if fail == 0 else 5


def cmd_doctor(args: argparse.Namespace) -> int:
    """Check health via MCP proxy (port 23120)"""
    ok = True
    print(f"python_executable={sys.executable}")
    print(f"python_version={sys.version.split()[0]}")

    req_mod = requests
    if req_mod is None:
        print("dep_requests=missing")
        if args.auto_install_deps:
            print("dep_requests=installing")
            r = subprocess.run([sys.executable, "-m", "pip", "install", "requests>=2.31.0"], capture_output=True, text=True)
            if r.returncode != 0:
                print("dep_requests=install_failed")
                print((r.stderr or r.stdout or "").strip()[:500])
                return 10
            import importlib
            req_mod = importlib.import_module("requests")
            print(f"dep_requests=installed version={getattr(req_mod, '__version__', 'unknown')}")
        else:
            print("hint=run: python -m pip install requests>=2.31.0")
            return 10
    else:
        print(f"dep_requests=ok version={getattr(req_mod, '__version__', 'unknown')}")

    # Check MCP Server
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        if client.ping():
            print(f"mcp_server_ping=ok port={args.mcp_port}")
        else:
            print(f"mcp_server_ping=fail port={args.mcp_port}")
            ok = False
    except Exception as e:
        print(f"mcp_server_ping=fail port={args.mcp_port} error={e}")
        ok = False

    # DEBUG: List available tools
    print("\n--- DEBUG: Available MCP Tools ---")
    try:
        tools = client.list_available_tools()
        if isinstance(tools, list):
            tool_names = [t.get("name", "unknown") for t in tools]
            print(f"debug=available_tools={tool_names}")
            print(f"debug=connector_health_in_list={'connector_health' in tool_names}")
            print(f"debug=zotero_doctor_in_list={'zotero_doctor' in tool_names}")
        else:
            print(f"debug=tools_list_error={tools}")
    except Exception as e:
        print(f"debug=tools_list_exception={e}")
    print("--- END DEBUG ---\n")

    # Check Zotero Local Connector via MCP proxy
    try:
        result = client.connector_health()
        if result.get("status") == "healthy":
            print(f"zotero_connector=ok")
        else:
            print(f"zotero_connector=fail status={result.get('status')}")
            ok = False
    except Exception as e:
        print(f"zotero_connector=check_error error={e}")
        # Don't fail the whole doctor if this check errors

    print("doctor=ok" if ok else "doctor=fail")
    return 0 if ok else 11


# =============================================================================
# MCP Command Handlers
# =============================================================================

def cmd_mcp_search(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.search_library(query=args.query, mode=args.mode, limit=args.limit)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_search_annotations(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        tags = args.tags.split(",") if args.tags else None
        result = client.search_annotations(
            query=args.query,
            color=args.color,
            tags=tags,
            limit=args.limit
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_search_fulltext(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.search_fulltext(query=args.query, limit=args.limit)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_item_details(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.get_item_details(item_key=args.item_key)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_item_abstract(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.get_item_abstract(item_key=args.item_key, format=args.format)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_get_content(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.get_content(item_key=args.item_key, mode=args.mode)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_collections(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.get_collections(limit=args.limit)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_collection_details(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.get_collection_details(collection_key=args.collection_key)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_collection_items(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.get_collection_items(
            collection_key=args.collection_key,
            limit=args.limit
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_subcollections(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.get_subcollections(
            collection_key=args.collection_key,
            recursive=args.recursive
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_semantic_search(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.semantic_search(query=args.query, limit=args.limit)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_find_similar(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.find_similar(item_key=args.item_key, limit=args.limit)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_semantic_status(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.semantic_status()
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_fulltext_db(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.fulltext_database(
            action=args.action,
            item_key=args.item_key,
            query=args.query,
            limit=args.limit
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_write_note(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        
        # Read note from file if specified
        note_content = args.note
        if args.note_file:
            if not os.path.exists(args.note_file):
                print(f"error=note file not found: {args.note_file}")
                return 21
            with open(args.note_file, "r", encoding="utf-8") as f:
                note_content = f.read()
        
        if not note_content:
            print("error=no note content provided (--note or --note-file required)")
            return 21
        
        result = client.write_note(item_key=args.item_key, note=note_content)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_read_note(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        # Notes are items, so we use get_content
        result = client.get_content(item_key=args.note_key, mode="complete")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_add_tags(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        tags = [t.strip() for t in args.tags.split(",") if t.strip()]
        result = client.write_tag(item_key=args.item_key, tags=tags, operation="add")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_remove_tags(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        tags = [t.strip() for t in args.tags.split(",") if t.strip()]
        result = client.write_tag(item_key=args.item_key, tags=tags, operation="remove")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_replace_tags(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        tags = [t.strip() for t in args.tags.split(",") if t.strip()]
        result = client.write_tag(item_key=args.item_key, tags=tags, operation="replace")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_update_metadata(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        metadata = {}
        if args.title:
            metadata["title"] = args.title
        if args.abstract:
            metadata["abstract"] = args.abstract
        if args.doi:
            metadata["DOI"] = args.doi
        if args.url:
            metadata["url"] = args.url
        if args.date:
            metadata["date"] = args.date
        
        if not metadata:
            print("error=no metadata fields to update")
            return 21
        
        result = client.write_metadata(args.item_key, **metadata)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_update_creators(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        try:
            creators = json.loads(args.creators)
        except json.JSONDecodeError as e:
            print(f"error=invalid JSON for creators: {e}")
            return 21
        
        result = client.write_metadata(args.item_key, creators=creators)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_create_item(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        properties = {}
        if args.title:
            properties["title"] = args.title
        if args.url:
            properties["url"] = args.url
        if args.abstract:
            properties["abstract"] = args.abstract
        if args.doi:
            properties["DOI"] = args.doi
        
        result = client.write_item(args.item_type, **properties)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


def cmd_mcp_reparent_pdf(args: argparse.Namespace) -> int:
    try:
        client = ZoteroMCPClient(port=args.mcp_port, timeout=args.timeout)
        result = client.write_item(
            "attachment",
            itemKey=args.pdf_key,
            parentItem=args.parent_key
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"error={e}")
        return 20


# =============================================================================
# Argument Parser
# =============================================================================

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Zotero local import/check tool with MCP support (Python-only)")
    sub = p.add_subparsers(dest="command", required=True)

    # Health check
    p_doctor = sub.add_parser("mcp-health", help="Check Python/runtime/dependencies/MCP/LocalConnector availability")
    p_doctor.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")), help="Zotero MCP server port")
    p_doctor.add_argument("--timeout", type=int, default=30, help="HTTP timeout seconds")
    p_doctor.add_argument("--auto-install-deps", action="store_true", help="Automatically install missing Python dependencies")
    p_doctor.set_defaults(func=cmd_doctor)

    # Import PDF
    p_import = sub.add_parser("mcp-import-pdf", help="Import one/multiple PDFs via MCP proxy")
    p_import.add_argument("--pdf", action="append", help="PDF path (repeat this arg to pass multiple PDFs)")
    p_import.add_argument("--dir", help="directory containing PDFs")
    p_import.add_argument("--recursive", action="store_true", help="recursive when using --dir")
    p_import.add_argument("--pick", action="append", help="pick specific PDF(s) inside --dir (repeatable, comma-separated supported)")
    p_import.add_argument("--collection", help="target collection name")
    p_import.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")), help="Zotero MCP server port")
    p_import.add_argument("--timeout", type=int, default=90, help="HTTP timeout seconds")
    p_import.set_defaults(func=cmd_import)

    # =============================================================================
    # MCP Commands
    # =============================================================================

    # MCP Search
    p_mcp_search = sub.add_parser("mcp-search", help="Search library via MCP (title, creator, year, tags, fulltext)")
    p_mcp_search.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")), help="Zotero MCP port")
    p_mcp_search.add_argument("--query", required=True, help="Search query")
    p_mcp_search.add_argument("--mode", default="title,creator,year,tags,fulltext", help="Search fields")
    p_mcp_search.add_argument("--limit", type=int, default=20)
    p_mcp_search.add_argument("--timeout", type=int, default=30)
    p_mcp_search.set_defaults(func=cmd_mcp_search)

    # MCP Search Annotations
    p_mcp_ann = sub.add_parser("mcp-search-annotations", help="Search annotations/highlights via MCP")
    p_mcp_ann.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_ann.add_argument("--query", required=True)
    p_mcp_ann.add_argument("--color", help="Filter by highlight color")
    p_mcp_ann.add_argument("--tags", help="Filter by tags (comma-separated)")
    p_mcp_ann.add_argument("--limit", type=int, default=20)
    p_mcp_ann.add_argument("--timeout", type=int, default=30)
    p_mcp_ann.set_defaults(func=cmd_mcp_search_annotations)

    # MCP Search Fulltext
    p_mcp_ft = sub.add_parser("mcp-search-fulltext", help="Full-text search via MCP")
    p_mcp_ft.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_ft.add_argument("--query", required=True)
    p_mcp_ft.add_argument("--limit", type=int, default=20)
    p_mcp_ft.add_argument("--timeout", type=int, default=30)
    p_mcp_ft.set_defaults(func=cmd_mcp_search_fulltext)

    # MCP Item Details
    p_mcp_item = sub.add_parser("mcp-item-details", help="Get item details via MCP")
    p_mcp_item.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_item.add_argument("--item-key", required=True)
    p_mcp_item.add_argument("--timeout", type=int, default=30)
    p_mcp_item.set_defaults(func=cmd_mcp_item_details)

    # MCP Item Abstract
    p_mcp_abs = sub.add_parser("mcp-item-abstract", help="Get item abstract via MCP")
    p_mcp_abs.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_abs.add_argument("--item-key", required=True)
    p_mcp_abs.add_argument("--format", default="text", choices=["text", "json"])
    p_mcp_abs.add_argument("--timeout", type=int, default=30)
    p_mcp_abs.set_defaults(func=cmd_mcp_item_abstract)

    # MCP Get Content
    p_mcp_content = sub.add_parser("mcp-get-content", help="Get content (PDF text, notes, abstracts) via MCP")
    p_mcp_content.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_content.add_argument("--item-key", required=True)
    p_mcp_content.add_argument("--mode", default="standard", choices=["minimal", "preview", "standard", "complete"])
    p_mcp_content.add_argument("--timeout", type=int, default=30)
    p_mcp_content.set_defaults(func=cmd_mcp_get_content)

    # MCP Collections
    p_mcp_cols = sub.add_parser("mcp-collections", help="List collections via MCP")
    p_mcp_cols.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_cols.add_argument("--limit", type=int, default=1000)
    p_mcp_cols.add_argument("--timeout", type=int, default=30)
    p_mcp_cols.set_defaults(func=cmd_mcp_collections)

    # MCP Collection Details
    p_mcp_col_det = sub.add_parser("mcp-collection-details", help="Get collection details via MCP")
    p_mcp_col_det.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_col_det.add_argument("--collection-key", required=True)
    p_mcp_col_det.add_argument("--timeout", type=int, default=30)
    p_mcp_col_det.set_defaults(func=cmd_mcp_collection_details)

    # MCP Collection Items
    p_mcp_col_items = sub.add_parser("mcp-collection-items", help="Get items in collection via MCP")
    p_mcp_col_items.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_col_items.add_argument("--collection-key", required=True)
    p_mcp_col_items.add_argument("--limit", type=int, default=50)
    p_mcp_col_items.add_argument("--timeout", type=int, default=30)
    p_mcp_col_items.set_defaults(func=cmd_mcp_collection_items)

    # MCP Subcollections
    p_mcp_sub = sub.add_parser("mcp-subcollections", help="Get subcollections via MCP")
    p_mcp_sub.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_sub.add_argument("--collection-key", required=True)
    p_mcp_sub.add_argument("--recursive", action="store_true")
    p_mcp_sub.add_argument("--timeout", type=int, default=30)
    p_mcp_sub.set_defaults(func=cmd_mcp_subcollections)

    # MCP Semantic Search
    p_mcp_sem = sub.add_parser("mcp-semantic-search", help="Semantic search via MCP (requires embedding setup)")
    p_mcp_sem.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_sem.add_argument("--query", required=True)
    p_mcp_sem.add_argument("--limit", type=int, default=10)
    p_mcp_sem.add_argument("--timeout", type=int, default=30)
    p_mcp_sem.set_defaults(func=cmd_mcp_semantic_search)

    # MCP Find Similar
    p_mcp_sim = sub.add_parser("mcp-find-similar", help="Find semantically similar items via MCP")
    p_mcp_sim.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_sim.add_argument("--item-key", required=True)
    p_mcp_sim.add_argument("--limit", type=int, default=10)
    p_mcp_sim.add_argument("--timeout", type=int, default=30)
    p_mcp_sim.set_defaults(func=cmd_mcp_find_similar)

    # MCP Semantic Status
    p_mcp_sem_stat = sub.add_parser("mcp-semantic-status", help="Check semantic search index status via MCP")
    p_mcp_sem_stat.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_sem_stat.add_argument("--timeout", type=int, default=30)
    p_mcp_sem_stat.set_defaults(func=cmd_mcp_semantic_status)

    # MCP Fulltext DB
    p_mcp_ftdb = sub.add_parser("mcp-fulltext-db", help="Full-text database operations via MCP")
    p_mcp_ftdb.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_ftdb.add_argument("--action", required=True, choices=["list", "search", "get", "stats"])
    p_mcp_ftdb.add_argument("--item-key", help="Item key (for 'get' action)")
    p_mcp_ftdb.add_argument("--query", help="Query (for 'search' action)")
    p_mcp_ftdb.add_argument("--limit", type=int, default=20)
    p_mcp_ftdb.add_argument("--timeout", type=int, default=30)
    p_mcp_ftdb.set_defaults(func=cmd_mcp_fulltext_db)

    # MCP Write Note
    p_mcp_note = sub.add_parser("mcp-write-note", help="Create/update note via MCP")
    p_mcp_note.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_note.add_argument("--item-key", required=True, help="Parent item key")
    p_mcp_note.add_argument("--note", help="Note content (Markdown, auto-converts to HTML)")
    p_mcp_note.add_argument("--note-file", help="Read note content from file")
    p_mcp_note.add_argument("--timeout", type=int, default=30)
    p_mcp_note.set_defaults(func=cmd_mcp_write_note)

    # MCP Read Note
    p_mcp_read_note = sub.add_parser("mcp-read-note", help="Read note content via MCP")
    p_mcp_read_note.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_read_note.add_argument("--note-key", required=True)
    p_mcp_read_note.add_argument("--timeout", type=int, default=30)
    p_mcp_read_note.set_defaults(func=cmd_mcp_read_note)

    # MCP Add Tags
    p_mcp_add_tags = sub.add_parser("mcp-add-tags", help="Add tags to item via MCP")
    p_mcp_add_tags.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_add_tags.add_argument("--item-key", required=True)
    p_mcp_add_tags.add_argument("--tags", required=True, help="Comma-separated tags")
    p_mcp_add_tags.add_argument("--timeout", type=int, default=30)
    p_mcp_add_tags.set_defaults(func=cmd_mcp_add_tags)

    # MCP Remove Tags
    p_mcp_rem_tags = sub.add_parser("mcp-remove-tags", help="Remove tags from item via MCP")
    p_mcp_rem_tags.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_rem_tags.add_argument("--item-key", required=True)
    p_mcp_rem_tags.add_argument("--tags", required=True, help="Comma-separated tags")
    p_mcp_rem_tags.add_argument("--timeout", type=int, default=30)
    p_mcp_rem_tags.set_defaults(func=cmd_mcp_remove_tags)

    # MCP Replace Tags
    p_mcp_rep_tags = sub.add_parser("mcp-replace-tags", help="Replace all tags on item via MCP")
    p_mcp_rep_tags.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_rep_tags.add_argument("--item-key", required=True)
    p_mcp_rep_tags.add_argument("--tags", required=True, help="Comma-separated tags")
    p_mcp_rep_tags.add_argument("--timeout", type=int, default=30)
    p_mcp_rep_tags.set_defaults(func=cmd_mcp_replace_tags)

    # MCP Update Metadata
    p_mcp_meta = sub.add_parser("mcp-update-metadata", help="Update item metadata via MCP")
    p_mcp_meta.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_meta.add_argument("--item-key", required=True)
    p_mcp_meta.add_argument("--title")
    p_mcp_meta.add_argument("--abstract")
    p_mcp_meta.add_argument("--doi")
    p_mcp_meta.add_argument("--url")
    p_mcp_meta.add_argument("--date")
    p_mcp_meta.add_argument("--timeout", type=int, default=30)
    p_mcp_meta.set_defaults(func=cmd_mcp_update_metadata)

    # MCP Update Creators
    p_mcp_creators = sub.add_parser("mcp-update-creators", help="Update item creators via MCP")
    p_mcp_creators.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_creators.add_argument("--item-key", required=True)
    p_mcp_creators.add_argument("--creators", required=True, help='JSON array of creators, e.g., \'[{"firstName":"John","lastName":"Doe","creatorType":"author"}]\'')
    p_mcp_creators.add_argument("--timeout", type=int, default=30)
    p_mcp_creators.set_defaults(func=cmd_mcp_update_creators)

    # MCP Create Item
    p_mcp_create = sub.add_parser("mcp-create-item", help="Create new item via MCP")
    p_mcp_create.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_create.add_argument("--item-type", required=True, help="e.g., journalArticle, book, webpage")
    p_mcp_create.add_argument("--title")
    p_mcp_create.add_argument("--url")
    p_mcp_create.add_argument("--abstract")
    p_mcp_create.add_argument("--doi")
    p_mcp_create.add_argument("--timeout", type=int, default=30)
    p_mcp_create.set_defaults(func=cmd_mcp_create_item)

    # MCP Reparent PDF
    p_mcp_reparent = sub.add_parser("mcp-reparent-pdf", help="Reparent standalone PDF to parent item via MCP")
    p_mcp_reparent.add_argument("--mcp-port", type=int, default=int(os.getenv("ZOTERO_MCP_PORT", "23120")))
    p_mcp_reparent.add_argument("--pdf-key", required=True)
    p_mcp_reparent.add_argument("--parent-key", required=True)
    p_mcp_reparent.add_argument("--timeout", type=int, default=30)
    p_mcp_reparent.set_defaults(func=cmd_mcp_reparent_pdf)

    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "import":
        if (not args.pdf) and (not args.dir):
            print("error=for import, provide --pdf (one or more) or --dir")
            return 2
        if args.pdf and args.dir:
            print("error=choose one input source: (--pdf ... repeated) OR --dir")
            return 2
        if args.pick and (not args.dir):
            print("error=--pick only works with --dir")
            return 2

    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
