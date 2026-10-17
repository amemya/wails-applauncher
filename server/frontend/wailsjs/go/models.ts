export namespace main {
	
	export class AppItem {
	    name: string;
	    description: string;
	    source_path?: string;
	    artifact_type: string;
	    build_command?: string;
	    artifact_path: string;
	    run_command: string;
	    launch_type?: string;
	    artifact_exists?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AppItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.source_path = source["source_path"];
	        this.artifact_type = source["artifact_type"];
	        this.build_command = source["build_command"];
	        this.artifact_path = source["artifact_path"];
	        this.run_command = source["run_command"];
	        this.launch_type = source["launch_type"];
	        this.artifact_exists = source["artifact_exists"];
	    }
	}
	export class BuildSuggestion {
	    suggested_command: string;
	    artifact_type: string;
	    artifact_path: string;
	    run_command: string;
	    launch_type: string;
	    detected_language: string;
	
	    static createFrom(source: any = {}) {
	        return new BuildSuggestion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.suggested_command = source["suggested_command"];
	        this.artifact_type = source["artifact_type"];
	        this.artifact_path = source["artifact_path"];
	        this.run_command = source["run_command"];
	        this.launch_type = source["launch_type"];
	        this.detected_language = source["detected_language"];
	    }
	}
	export class ServerStatus {
	    running: boolean;
	    port: string;
	    ips: string[];
	    urls: string[];
	    apps_dir: string;
	
	    static createFrom(source: any = {}) {
	        return new ServerStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.port = source["port"];
	        this.ips = source["ips"];
	        this.urls = source["urls"];
	        this.apps_dir = source["apps_dir"];
	    }
	}

}

