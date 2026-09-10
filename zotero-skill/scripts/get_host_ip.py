#!/usr/bin/env python3
"""
Determine host IP address when running inside a Docker container.

This script uses multiple methods to find the host machine's IP address
from within a container, ordered by reliability.

Usage:
    python get_host_ip.py                    # Print host IP
    python get_host_ip.py --verbose          # Print details of all methods tried
    python get_host_ip.py --format env       # Output as export statements
    python get_host_ip.py --format json      # Output as JSON

Environment Variables:
    HOST_IP      - If set, use this value directly (highest priority)
    DOCKER_HOST  - If set, parse IP from docker host URL
"""

import argparse
import json
import os
import re
import socket
import subprocess
import sys
from typing import Optional, Tuple, List, Dict, Any


def get_host_ip_from_env() -> Optional[str]:
    """Method 1: Check if HOST_IP is explicitly set in environment."""
    return os.environ.get("HOST_IP")


def get_host_ip_from_docker_host() -> Optional[str]:
    """Method 2: Parse IP from DOCKER_HOST environment variable."""
    docker_host = os.environ.get("DOCKER_HOST", "")
    if not docker_host:
        return None
    
    # Parse tcp://192.168.1.100:2375
    match = re.search(r'tcp://([^:]+):', docker_host)
    if match:
        return match.group(1)
    return None


def get_host_ip_from_host_docker_internal() -> Optional[str]:
    """Method 3: Try to resolve host.docker.internal (Docker Desktop)."""
    try:
        # This works on Docker Desktop for Mac/Windows
        return socket.gethostbyname("host.docker.internal")
    except socket.gaierror:
        return None


def get_host_ip_from_gateway() -> Optional[str]:
    """Method 4: Get default gateway IP (Linux containers)."""
    try:
        # Read default gateway from /proc/net/route
        with open("/proc/net/route", "r") as f:
            for line in f.readlines():
                fields = line.strip().split()
                if len(fields) >= 3 and fields[1] == "00000000":  # Default route
                    gateway_hex = fields[2]
                    # Convert hex IP to dotted decimal (little endian)
                    gateway_ip = ".".join(
                        str(int(gateway_hex[i:i+2], 16)) 
                        for i in (6, 4, 2, 0)
                    )
                    return gateway_ip
    except (FileNotFoundError, PermissionError, ValueError):
        pass
    
    # Fallback: try ip route command
    try:
        result = subprocess.run(
            ["ip", "route"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            # Look for "default via xxx.xxx.xxx.xxx"
            match = re.search(r'default via ([\d.]+)', result.stdout)
            if match:
                return match.group(1)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    
    return None


def get_host_ip_from_etc_hosts() -> Optional[str]:
    """Method 5: Parse /etc/hosts for host entries."""
    try:
        with open("/etc/hosts", "r") as f:
            content = f.read()
            
        # Look for host.docker.internal entry
        match = re.search(r'([\d.]+)\s+host\.docker\.internal', content)
        if match:
            return match.group(1)
            
        # Look for host-gateway entry
        match = re.search(r'([\d.]+)\s+host-gateway', content)
        if match:
            return match.group(1)
            
    except (FileNotFoundError, PermissionError):
        pass
    return None


def get_host_ip_from_hostname() -> Optional[str]:
    """Method 6: Try to get host IP via hostname -I (if available)."""
    try:
        result = subprocess.run(
            ["hostname", "-I"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            # hostname -I returns all IPs, take the first one
            ips = result.stdout.strip().split()
            if ips:
                # Filter for private IPs first
                for ip in ips:
                    if ip.startswith("192.168.") or ip.startswith("10.") or ip.startswith("172."):
                        return ip
                return ips[0]
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def get_host_ip_from_network_interfaces() -> Optional[str]:
    """Method 7: Inspect network interfaces for clues."""
    try:
        import netifaces
        
        # Get default gateway interface
        gateways = netifaces.gateways()
        if 'default' in gateways and netifaces.AF_INET in gateways['default']:
            gateway_ip = gateways['default'][netifaces.AF_INET][0]
            return gateway_ip
    except ImportError:
        pass
    except Exception:
        pass
    return None


def validate_ip(ip: str) -> bool:
    """Validate that the string is a valid IPv4 address."""
    if not ip or ip in ("127.0.0.1", "0.0.0.0", "localhost"):
        return False
    
    parts = ip.split(".")
    if len(parts) != 4:
        return False
    
    try:
        for part in parts:
            num = int(part)
            if num < 0 or num > 255:
                return False
        return True
    except ValueError:
        return False


def get_host_ip(verbose: bool = False) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    """
    Try multiple methods to get the host IP.
    
    Returns:
        Tuple of (best_ip, details) where details is a list of method results
    """
    methods = [
        ("Environment Variable HOST_IP", get_host_ip_from_env),
        ("DOCKER_HOST Variable", get_host_ip_from_docker_host),
        ("host.docker.internal DNS", get_host_ip_from_host_docker_internal),
        ("Default Gateway", get_host_ip_from_gateway),
        ("/etc/hosts File", get_host_ip_from_etc_hosts),
        ("hostname Command", get_host_ip_from_hostname),
        ("Network Interfaces", get_host_ip_from_network_interfaces),
    ]
    
    results = []
    best_ip = None
    
    for method_name, method_func in methods:
        try:
            ip = method_func()
            is_valid = validate_ip(ip) if ip else False
            
            result = {
                "method": method_name,
                "ip": ip,
                "valid": is_valid
            }
            results.append(result)
            
            if is_valid and best_ip is None:
                best_ip = ip
                if not verbose:
                    # If not verbose, return first valid IP
                    return best_ip, results
        except Exception as e:
            results.append({
                "method": method_name,
                "ip": None,
                "valid": False,
                "error": str(e)
            })
    
    return best_ip, results


def output_env_format(ip: Optional[str], results: List[Dict[str, Any]]) -> None:
    """Output as shell export statements."""
    if ip:
        print(f'export HOST="{ip}"')
        print(f'export HOST_IP="{ip}"')
        print(f'export ZOTERO_HOST="{ip}"')
    else:
        # Default fallback
        print(f'export HOST="host.docker.internal"')
        print(f'export HOST_IP="host.docker.internal"')
        print(f'export ZOTERO_HOST="host.docker.internal"')


def output_json_format(ip: Optional[str], results: List[Dict[str, Any]]) -> None:
    """Output as JSON."""
    output = {
        "host_ip": ip,
        "valid": validate_ip(ip) if ip else False,
        "methods": results
    }
    print(json.dumps(output, indent=2))


def output_verbose_format(ip: Optional[str], results: List[Dict[str, Any]]) -> None:
    """Output detailed verbose format."""
    print("=" * 60)
    print("Host IP Detection Results")
    print("=" * 60)
    print()
    
    for i, result in enumerate(results, 1):
        status = "✅ VALID" if result["valid"] else "❌ Failed"
        print(f"{i}. {result['method']}")
        print(f"   Result: {result['ip'] or 'N/A'}")
        print(f"   Status: {status}")
        if "error" in result:
            print(f"   Error: {result['error']}")
        print()
    
    print("=" * 60)
    if ip:
        print(f"Selected Host IP: {ip}")
    else:
        print("Could not determine host IP. Consider:")
        print("  - Setting HOST_IP environment variable")
        print("  - Using --network host when running container")
        print("  - Using host.docker.internal (Docker Desktop)")
    print("=" * 60)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Determine host IP address from within a Docker container"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show details of all methods tried"
    )
    parser.add_argument(
        "--format", "-f",
        choices=["text", "json", "env"],
        default="text",
        help="Output format (default: text)"
    )
    parser.add_argument(
        "--default", "-d",
        default="host.docker.internal",
        help="Default value if IP cannot be determined (default: host.docker.internal)"
    )
    
    args = parser.parse_args()
    
    # Get host IP
    best_ip, results = get_host_ip(verbose=args.verbose)
    
    # Use default if no IP found
    if best_ip is None:
        best_ip = args.default
    
    # Output based on format
    if args.format == "json":
        output_json_format(best_ip, results)
    elif args.format == "env":
        output_env_format(best_ip, results)
    elif args.verbose:
        output_verbose_format(best_ip, results)
    else:
        # Simple text output - just the IP
        print(best_ip)
    
    return 0 if validate_ip(best_ip) or best_ip == args.default else 1


if __name__ == "__main__":
    sys.exit(main())
